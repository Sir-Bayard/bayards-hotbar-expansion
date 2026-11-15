import { addUserContextOption, openHotbarEditor, watchUsers } from "./editor.mjs";
import { applyAccent, onRenderSettings, resetAccent, useAccentBar } from "./accent.mjs";
import { ACCENTS, CUSTOM_DEFAULT, PAGE_SIZE, clampPage, clampSlots, serial, slotFor } from "./helpers.mjs";
import { clearLayout, observeLayout, place, schedule, scheduleSettled, unobserveLayout, useBar } from "./layout.mjs";

const MODULE_ID = "bayards-hotbar-expansion";
const TEMPLATE = `modules/${MODULE_ID}/templates/expansion.hbs`;

/** The second row, once it exists. */
let bar = null;
useBar(() => bar);
useAccentBar(() => bar);

/* -------------------------------------------- */
/*  The second row                              */
/* -------------------------------------------- */

/**
 * A second hotbar row. It is core's Hotbar showing another page, so clicking,
 * dragging, the right-click menu, the lock and system drops (PF2e items and
 * actions) all work the way they do on the first row. Only the template, the
 * shown slot count and where it sits on screen are this module's own.
 */
function defineExpansionBar() {
  const Hotbar = foundry.applications.ui.Hotbar;

  return class ExpansionHotbar extends Hotbar {
    static DEFAULT_OPTIONS = {
      id: "bhe-hotbar",
      classes: ["bhe-hotbar"]
    };

    static PARTS = {
      hotbar: { root: true, template: TEMPLATE }
    };

    /** Show only the first N slots of the page (the setting). */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      context.slots = context.slots.slice(0, shownSlots());
      return context;
    }

    /** This row has no lock or mute buttons to update. */
    _updateToggles() {}

    /** Sit next to the first row instead of at the end of the page. */
    _insertElement(element) {
      const existing = document.getElementById(element.id);
      if (existing && existing !== element) existing.replaceWith(element);
      else if (!element.isConnected) document.getElementById("ui-bottom")?.append(element);
      place(element);
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      applyAccent();
      schedule(true);
    }

    /** Leave core's list of macro apps when the row is switched off. */
    _onClose(options) {
      super._onClose(options);
      const i = game.macros.apps.indexOf(this);
      if (i >= 0) game.macros.apps.splice(i, 1);
    }

    /** Remember the page this row shows. */
    async changePage(page) {
      await super.changePage(page);
      const shown = this.page;
      if (game.settings.get(MODULE_ID, "page") !== shown) await game.settings.set(MODULE_ID, "page", shown);
    }
  };
}

function shownSlots() {
  return clampSlots(game.settings.get(MODULE_ID, "slots"));
}

/** Run the macro in slot n (1 to 10) of the second row's page. */
function executeSlot(n) {
  if (!bar?.rendered) return false;
  const slot = slotFor(bar.page, n, shownSlots());
  if (!slot) return false;
  const macro = game.macros.get(game.user.hotbar[slot]);
  if (!macro) return false;
  macro.execute();
  return true;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "BHE.Settings.Enabled.Name",
    hint: "BHE.Settings.Enabled.Hint",
    scope: "user",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => syncBar()
  });

  game.settings.register(MODULE_ID, "slots", {
    name: "BHE.Settings.Slots.Name",
    hint: "BHE.Settings.Slots.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 1, max: PAGE_SIZE, step: 1 },
    default: PAGE_SIZE,
    onChange: () => bar?.render()
  });

  game.settings.register(MODULE_ID, "liftChat", {
    name: "BHE.Settings.LiftChat.Name",
    hint: "BHE.Settings.LiftChat.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => schedule(true)
  });

  game.settings.register(MODULE_ID, "accent", {
    name: "BHE.Settings.Accent.Name",
    hint: "BHE.Settings.Accent.Hint",
    scope: "user",
    config: true,
    type: String,
    choices: {
      none: "BHE.Settings.Accent.None",
      ...Object.fromEntries(Object.keys(ACCENTS).map(k => [k, `BHE.Settings.Accent.${k[0].toUpperCase()}${k.slice(1)}`])),
      player: "BHE.Settings.Accent.Player",
      custom: "BHE.Settings.Accent.Custom"
    },
    default: "none",
    onChange: () => applyAccent()
  });

  game.settings.register(MODULE_ID, "accentCustom", {
    name: "BHE.Settings.AccentCustom.Name",
    hint: "BHE.Settings.AccentCustom.Hint",
    scope: "user",
    config: true,
    type: new foundry.data.fields.ColorField({ nullable: false, initial: CUSTOM_DEFAULT }),
    default: CUSTOM_DEFAULT,
    onChange: () => applyAccent()
  });

  game.settings.register(MODULE_ID, "accentStrength", {
    name: "BHE.Settings.AccentStrength.Name",
    hint: "BHE.Settings.AccentStrength.Hint",
    scope: "user",
    config: true,
    type: Number,
    range: { min: 10, max: 60, step: 5 },
    default: 30,
    onChange: () => applyAccent()
  });

  game.settings.register(MODULE_ID, "page", {
    scope: "user",
    config: false,
    type: Number,
    default: 2
  });

  const { ALT, SHIFT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;
  for (let n = 1; n <= PAGE_SIZE; n++) {
    game.keybindings.register(MODULE_ID, `slot${n}`, {
      name: `BHE.Keys.Slot${n}`,
      editable: [{ key: `Digit${n % 10}`, modifiers: [ALT, SHIFT] }],
      onDown: () => executeSlot(n),
      precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
  }
});

/* -------------------------------------------- */
/*  Switching the row on and off                */
/* -------------------------------------------- */

let ExpansionHotbar = null;

/**
 * Starting and stopping take a few awaits each, and a change can arrive while
 * one is under way (the setting saved twice quickly, or from the same user's
 * other tab). Run them one at a time, each making the row match the setting
 * as it is saved when its turn comes.
 */
const switching = serial(error => console.error(`${MODULE_ID} |`, error));

function syncBar() {
  // Before ready, core's hotbar isn't drawn yet; the ready hook syncs once it is.
  if (!game.ready) return Promise.resolve();
  return switching(() => (game.settings.get(MODULE_ID, "enabled") ? startBar() : stopBar()));
}

/** Show the second row (the user's "Show the second row" setting). */
async function startBar() {
  if (bar?.rendered) return observeLayout();
  ExpansionHotbar ??= defineExpansionBar();
  bar ??= new ExpansionHotbar();
  try {
    // changePage only re-renders a bar that is already on screen.
    await bar.changePage(clampPage(game.settings.get(MODULE_ID, "page")));
    await bar.render({ force: true });
  } catch (error) {
    // Start afresh next time rather than reuse a half-made row.
    bar?.element?.remove();
    bar = null;
    throw error;
  }
  observeLayout();
  schedule(true);
}

/** Take the second row away and put everything it moved back. */
async function stopBar() {
  unobserveLayout();
  const old = bar;
  bar = null;
  if (old?.rendered) await old.close({ force: true, animate: false });
  old?.element?.remove();
  clearLayout();
  resetAccent();
}

Hooks.once("ready", async () => {
  game.modules.get(MODULE_ID).api = {
    get bar() { return bar; },
    executeSlot,
    editHotbar: openHotbarEditor
  };
  window.addEventListener("resize", foundry.utils.debounce(() => schedule(), 100));
  await syncBar();
});

// Core's row re-renders when the user's hotbar changes; show the same change here.
Hooks.on("renderHotbar", app => {
  if (!bar || app === bar) return;
  if (app === ui.hotbar) bar.render();
});

// Another module may move or rebuild the panel that holds #hotbar (PF2e HUD
// does on every render). Put the row back at once, before the browser paints,
// and check the fit on the next tick; that check stops early if the screen
// ended up as it was. Framed windows (sheets, dialogs) float over the interface
// and can't change the bottom of the screen, so they don't call for one.
function onOtherApp(app) {
  if (!bar?.element || app === bar) return;
  const moved = place(bar.element);
  if (!moved && app.hasFrame) return;
  schedule();
}
Hooks.on("renderApplicationV2", onOtherApp);
Hooks.on("closeApplicationV2", onOtherApp);

// The user's own color can change while "Player color" is chosen.
Hooks.on("updateUser", (user, changes) => {
  if (user === game.user && "color" in changes) applyAccent();
});
Hooks.on("renderSettingsConfig", onRenderSettings);

// The GM's hotbar editor, from the Players list.
Hooks.on("getUserContextOptions", addUserContextOption);
watchUsers();

Hooks.on("collapseSidebar", scheduleSettled);
// The interface scale or font size, saved from the (framed) Settings window.
Hooks.on("clientSettingChanged", () => schedule());
Hooks.on("changeSidebarTab", scheduleSettled);
