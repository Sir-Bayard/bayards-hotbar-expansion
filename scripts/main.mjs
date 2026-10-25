import { ACCENTS, CUSTOM_DEFAULT, PAGE_SIZE, accentColor, chatLift, clampPage, clampSlots, clampStrength, fitSlotSize, gridStartAfter, slotFor, textOn } from "./helpers.mjs";

const MODULE_ID = "bayards-hotbar-expansion";
const TEMPLATE = `modules/${MODULE_ID}/templates/expansion.hbs`;
const DOCK_ID = "bhe-dock";
/** Foundry's right-hand column: the floating chat input, and docked panels such as PF2e HUD's tracker. */
const RIGHT_COLUMN = "ui-right-column-1";

/** The second row, once it exists. */
let bar = null;

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
      schedule();
    }

    /** Leave core's list of macro apps when the row is switched off. */
    _onClose(options) {
      super._onClose?.(options);
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

/* -------------------------------------------- */
/*  Accent color                                */
/* -------------------------------------------- */

/** The user's own color as "#rrggbb" (a Color object in Foundry 14). */
function userColor() {
  const c = game.user?.color;
  return c?.css ?? (c != null ? String(c) : null);
}

/**
 * Tint the second row's slots, number badges and page selector, or clear it.
 * `preview` (from the open settings window) stands in for the stored values.
 */
function applyAccent(preview = null) {
  const element = bar?.element;
  if (!element) return;
  const get = key => (preview && key in preview ? preview[key] : game.settings.get(MODULE_ID, key));
  const color = accentColor(get("accent"), String(get("accentCustom") ?? ""), userColor());
  element.classList.toggle("bhe-accented", !!color);
  if (!color) {
    for (const v of ["--bhe-accent", "--bhe-accent-text", "--bhe-accent-wash"]) element.style.removeProperty(v);
  } else {
    element.style.setProperty("--bhe-accent", color);
    element.style.setProperty("--bhe-accent-text", textOn(color));
    element.style.setProperty("--bhe-accent-wash", `${clampStrength(get("accentStrength"))}%`);
  }
  // The page selector's border can change the row's width.
  schedule();
}

/**
 * In the settings window: show the accent on the row as it is changed, before
 * saving (closing without saving puts the stored one back), and grey out the
 * custom color and strength when they don't apply.
 */
function onRenderSettings(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root?.querySelector(`[name="${MODULE_ID}.accent"]`)) return;
  // The window's element survives its re-renders; bind once per window.
  if (root.dataset.bheBound) return syncSettings(root);
  root.dataset.bheBound = "1";
  const live = () => setTimeout(() => syncSettings(root), 0);
  for (const type of ["input", "change", "click"]) root.addEventListener(type, live);
  const onClose = closed => {
    if (closed !== app) return;
    Hooks.off("closeSettingsConfig", hook);
    applyAccent();
  };
  const hook = Hooks.on("closeSettingsConfig", onClose);
  syncSettings(root);
}

/** Read the accent fields from the settings form, preview them and grey out the unused ones. */
function syncSettings(root) {
  const field = key => root.querySelector(`[name="${MODULE_ID}.${key}"]`);
  const select = field("accent");
  if (!select) return;
  const custom = field("accentCustom"), strength = field("accentStrength");
  custom?.closest(".form-group")?.classList.toggle("bhe-setting-off", select.value !== "custom");
  strength?.closest(".form-group")?.classList.toggle("bhe-setting-off", select.value === "none");
  const preview = { accent: select.value };
  if (custom?.value) preview.accentCustom = custom.value;
  if (strength && strength.value !== "" && strength.value != null) preview.accentStrength = strength.value;
  applyAccent(preview);
}

function shownSlots() {
  return clampSlots(game.settings.get(MODULE_ID, "slots"));
}

/* -------------------------------------------- */
/*  Placement                                   */
/* -------------------------------------------- */

/**
 * Put the second row right after core's #hotbar, wherever that is now.
 * - In core's layout #hotbar sits in #ui-bottom, which stacks its children in a
 *   column, so both rows go into a small row container there.
 * - When another module has taken #hotbar into its own panel (PF2e HUD's
 *   persistent HUD does, and rebuilds that panel's contents on every render),
 *   the second row follows it as a sibling, and in a grid it takes the next
 *   column on the hotbar's grid row.
 */
function place(element = bar?.element) {
  const hotbar = document.getElementById("hotbar");
  if (!element || !hotbar || element === hotbar) return;
  const uiBottom = document.getElementById("ui-bottom");
  let dock = document.getElementById(DOCK_ID);
  const parent = hotbar.parentElement;

  if (parent === uiBottom || (dock && parent === dock)) {
    if (!dock) {
      dock = document.createElement("div");
      dock.id = DOCK_ID;
    }
    if (parent !== dock) {
      hotbar.before(dock);
      dock.append(hotbar);
    }
    if (element.previousElementSibling !== hotbar) hotbar.after(element);
    clearGrid(element);
    // Sit on the same line as the first row, whatever bottom margin it has been given.
    element.style.marginBottom = getComputedStyle(hotbar).marginBottom;
    return;
  }
  element.style.removeProperty("margin-bottom");

  if (element.previousElementSibling !== hotbar) hotbar.after(element);
  if (dock && !dock.children.length) dock.remove();

  const style = getComputedStyle(parent);
  if (style.display === "grid" || style.display === "inline-grid") {
    const hb = getComputedStyle(hotbar);
    element.classList.add("bhe-in-grid");
    element.style.gridRowStart = hb.gridRowStart;
    element.style.gridRowEnd = hb.gridRowEnd;
    element.style.gridColumnStart = gridStartAfter(hb.gridColumnEnd);
    element.style.gridColumnEnd = "span 1";
  } else clearGrid(element);
}

function clearGrid(element) {
  if (!element.classList.contains("bhe-in-grid")) return;
  element.classList.remove("bhe-in-grid");
  for (const p of ["gridRowStart", "gridRowEnd", "gridColumnStart", "gridColumnEnd"]) element.style[p] = "";
}

/**
 * Keep the row on screen. It must stop before the sidebar, and in core's layout
 * (both rows centred together) also clear the player list and scene controls.
 * In core's layout both rows first slide over into free space; slots shrink only
 * when that isn't enough. In another module's panel the slots shrink, measuring
 * again each time because a centred panel moves as it narrows.
 * Positions are read in screen pixels; sizes are written in layout pixels.
 */
function fit(element) {
  const dock = element.parentElement?.id === DOCK_ID ? element.parentElement : null;
  element.style.removeProperty("--bhe-fit-size");
  if (dock) dock.style.removeProperty("translate");
  if (element.classList.contains("bhe-hidden")) return;
  const hotbar = document.getElementById("hotbar");
  const slot = element.querySelector(".slot");
  if (!slot) return;
  const scale = slot.offsetWidth ? slot.getBoundingClientRect().width / slot.offsetWidth : 1;
  // In a panel the row's own box is width-contained, so measure its contents.
  const rowRight = () => contentRect(element)?.right ?? 0;
  const iface = document.getElementById("interface")?.getBoundingClientRect();
  const sidebar = document.getElementById("sidebar");
  let right = (sidebar?.getClientRects().length ? sidebar.getBoundingClientRect().left : (iface?.right ?? window.innerWidth)) - 8;
  // With lifting off, panels in the right-hand column that come down into the
  // row's band (PF2e HUD's combat tracker, say) are an edge too. The chat input
  // never is: it only floats there when the sidebar isn't on Chat.
  const band = game.settings.get(MODULE_ID, "liftChat") ? null : contentRect(element);
  if (band) {
    for (const part of document.querySelectorAll("#ui-right-column-1 > *")) {
      if (part.id === "chat-notifications" || !part.getClientRects().length) continue;
      const r = part.getBoundingClientRect();
      if (r.width > 1 && r.height > 1 && r.bottom > band.top && r.top < band.bottom) right = Math.min(right, r.left - 8);
    }
  }
  const slotWidth = () => element.querySelector(".slot")?.getBoundingClientRect().width ?? 0;
  // Slots on one line (core's narrow layout stacks them five by two).
  const perLine = () => {
    const slots = [...element.querySelectorAll(".slot")];
    const top = slots[0].getBoundingClientRect().top;
    return slots.filter(s => Math.abs(s.getBoundingClientRect().top - top) < 2).length;
  };

  if (!dock) {
    for (let pass = 0; pass < 6; pass++) {
      const size = fitSlotSize(slotWidth(), perLine(), rowRight() - right, scale);
      if (!size) return;
      element.style.setProperty("--bhe-fit-size", `${size}px`);
    }
    return;
  }

  let left = (iface?.left ?? 0) + 8;
  const d = dock.getBoundingClientRect();
  // The player list's inner boxes can spill past it, so look at its children too.
  for (const id of ["players", "scene-controls"]) {
    const e = document.getElementById(id);
    if (!e?.getClientRects().length) continue;
    for (const part of [e, ...e.children]) {
      const r = part.getBoundingClientRect();
      if (r.width && r.bottom > d.top && r.top < d.bottom) left = Math.max(left, r.right + 8);
    }
  }
  const span = () => [hotbar.getBoundingClientRect().left, rowRight()];
  let [first, last] = span();
  for (let pass = 0; pass < 6; pass++) {
    const size = fitSlotSize(slotWidth(), perLine(), (last - first) - (right - left), scale);
    if (!size) break;
    element.style.setProperty("--bhe-fit-size", `${size}px`);
    [first, last] = span();
  }
  let shift = 0;
  if (last > right) shift = Math.max(right - last, left - first);
  else if (first < left) shift = Math.min(left - first, right - last);
  if (shift) dock.style.translate = `${Math.round(shift / scale)}px 0`;
}

/** Hide the second row whenever core's row isn't shown. */
function matchVisibility(element) {
  const hotbar = document.getElementById("hotbar");
  const hidden = !hotbar || hotbar.getClientRects().length === 0;
  element.classList.toggle("bhe-hidden", hidden);
  return !hidden;
}

/** The box around the row's contents (its own box may be width-contained). */
function contentRect(element) {
  const rects = [...element.children].map(c => c.getBoundingClientRect()).filter(r => r.width || r.height);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map(r => r.left)),
    right: Math.max(...rects.map(r => r.right)),
    top: Math.min(...rects.map(r => r.top)),
    bottom: Math.max(...rects.map(r => r.bottom))
  };
}

/* -------------------------------------------- */
/*  The floating chat input                     */
/* -------------------------------------------- */

/**
 * When the sidebar isn't on the Chat tab, Foundry floats the chat input at the
 * bottom of the right-hand column. If the second row reaches under it, lift the
 * column so its bottom clears the row.
 */
function liftChat(clearOnly = false) {
  const column = document.getElementById(RIGHT_COLUMN);
  if (!column) return;
  if (clearOnly) {
    column.classList.remove("bhe-lifted");
    return;
  }
  const applied = column.style.getPropertyValue("--bhe-col-lift");
  // Measure the column unlifted (no paint happens in between).
  column.classList.remove("bhe-lifted");
  let lift = 0, pad = 0, scale = 1;
  const element = bar?.element;
  const band = element?.isConnected && !element.classList.contains("bhe-hidden") ? contentRect(element) : null;
  if (game.settings.get(MODULE_ID, "liftChat") && band) {
    const box = column.getBoundingClientRect();
    scale = column.offsetWidth ? box.width / column.offsetWidth : 1;
    pad = parseFloat(getComputedStyle(column).paddingBottom) || 0;
    // The column and whatever in it reaches down into the row's band; the chat
    // area is a little wider than the column itself.
    const parts = [column, ...column.children]
      .filter(p => p.getClientRects().length)
      .map(p => p.getBoundingClientRect())
      .filter(r => r.width > 1 && r.height > 1 && r.bottom > band.top);
    const area = {
      left: Math.min(...parts.map(r => r.left)),
      right: Math.max(...parts.map(r => r.right)),
      bottom: box.bottom - pad * scale
    };
    lift = chatLift(band, area);
  }
  if (!lift) {
    column.style.removeProperty("--bhe-col-lift");
    column.style.removeProperty("--bhe-col-pad");
    return;
  }
  const px = `${Math.ceil(lift / scale)}px`;
  column.style.setProperty("--bhe-col-pad", `${pad}px`);
  if (px !== applied) column.style.setProperty("--bhe-col-lift", px);
  column.classList.add("bhe-lifted");
}

/* -------------------------------------------- */
/*  Keeping up                                  */
/* -------------------------------------------- */

let pending = null;

/** Re-place the row and re-check the chat input once the page has settled. */
function schedule() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const element = bar?.element;
    if (!element) return;
    place(element);
    if (matchVisibility(element)) {
      // Core's width classes stack the row five by two, which a panel row can't take.
      if (element.classList.contains("bhe-in-grid")) element.classList.remove("lg", "md", "sm", "min");
      else bar._onResize();
    }
    // Fit against the column as it sits unlifted (with lifting off its panels
    // are edges), then lift it clear of the row's final size.
    liftChat(true);
    fit(element);
    liftChat();
  }, 0);
}

/** Again after the sidebar's slide has finished. */
function scheduleSettled() {
  schedule();
  setTimeout(schedule, 400);
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
    onChange: value => (value ? startBar() : stopBar())
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
    onChange: () => schedule()
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
let observer = null;

/** Show the second row (the user's "Show the second row" setting). */
async function startBar() {
  if (bar?.rendered) return;
  ExpansionHotbar ??= defineExpansionBar();
  bar ??= new ExpansionHotbar();
  // changePage only re-renders a bar that is already on screen.
  await bar.changePage(clampPage(game.settings.get(MODULE_ID, "page")));
  await bar.render({ force: true });
  // #hotbar shown, hidden or resized without any app rendering.
  const hotbar = document.getElementById("hotbar");
  if (hotbar && typeof ResizeObserver === "function") {
    observer = new ResizeObserver(() => schedule());
    observer.observe(hotbar);
  }
  schedule();
}

/** Take the second row away and put everything it moved back. */
async function stopBar() {
  observer?.disconnect();
  observer = null;
  const old = bar;
  bar = null;
  if (old?.rendered) await old.close({ force: true, animate: false });
  old?.element?.remove();
  const dock = document.getElementById(DOCK_ID);
  if (dock) {
    for (const child of [...dock.children]) dock.before(child);
    dock.remove();
  }
  const column = document.getElementById(RIGHT_COLUMN);
  if (column) {
    column.classList.remove("bhe-lifted");
    column.style.removeProperty("--bhe-col-lift");
    column.style.removeProperty("--bhe-col-pad");
  }
}

Hooks.once("ready", async () => {
  game.modules.get(MODULE_ID).api = {
    get bar() { return bar; },
    executeSlot
  };
  window.addEventListener("resize", foundry.utils.debounce(schedule, 100));
  if (game.settings.get(MODULE_ID, "enabled")) await startBar();
});

// Core's row re-renders when the user's hotbar changes; show the same change here.
Hooks.on("renderHotbar", app => {
  if (!bar || app === bar) return;
  if (app === ui.hotbar) bar.render();
});

// Another module may move or rebuild the panel that holds #hotbar. Put the row
// back at once, before the browser paints; measure on the next tick.
function onOtherApp(app) {
  if (!bar?.element || app === bar) return;
  place(bar.element);
  schedule();
}
Hooks.on("renderApplicationV2", onOtherApp);
Hooks.on("closeApplicationV2", onOtherApp);

// The user's own color can change while "Player color" is chosen.
Hooks.on("updateUser", (user, changes) => {
  if (user === game.user && "color" in changes) applyAccent();
});
Hooks.on("renderSettingsConfig", onRenderSettings);

Hooks.on("collapseSidebar", scheduleSettled);
Hooks.on("changeSidebarTab", scheduleSettled);
