/**
 * The GM's hotbar editor: one user's whole hotbar (five pages of ten) in a
 * window, opened from the Players list. Drop macros on it, move them between
 * slots and pages, create, edit, remove and delete them. A macro put on a
 * player's hotbar that they can't run is shared with them (Observer). The
 * user's name in the title bar switches the window to another user.
 */

import { PAGE_COUNT, PAGE_SIZE } from "./helpers.mjs";

const MODULE_ID = "bayards-hotbar-expansion";
const TEMPLATE = `modules/${MODULE_ID}/templates/editor.hbs`;

/** The editor window (one at a time). Set before its first render, cleared on close. */
let editor = null;
let editorCount = 0;

/** Open the editor for a user, or switch the open one to them. GM only. */
export function openHotbarEditor(user) {
  if (!game.user.isGM) {
    ui.notifications.warn("BHE.Editor.GMOnly", { localize: true });
    return null;
  }
  const target = typeof user === "string" ? game.users.get(user) : user;
  if (!target) return null;
  if (editor && !editor.closing) {
    editor.switchUser(target);
    if (editor.minimized) editor.maximize();
    if (editor.rendered) editor.bringToFront?.();
    return editor;
  }
  // A window still fading out keeps its own id; the new one gets another.
  const Editor = defineEditor();
  editor = new Editor({ id: `bhe-editor-${++editorCount}`, userId: target.id });
  editor.render({ force: true });
  return editor;
}

/** The Players list: "Edit Hotbar" on each user, for the GM. */
export function addUserContextOption(_app, options) {
  options.push({
    label: "BHE.Editor.Menu",
    icon: '<i class="fa-solid fa-table-cells"></i>',
    visible: () => game.user.isGM,
    onClick: (_event, li) => openHotbarEditor(userIdOf(li))
  });
}

/** Keep the open editor in step with the user list. */
export function watchUsers() {
  Hooks.on("createUser", () => editor?.refreshUsers());
  Hooks.on("deleteUser", user => {
    if (!editor) return;
    if (editor.userId === user.id) editor.close();
    else editor.refreshUsers();
  });
  Hooks.on("updateUser", (user, changes) => {
    if (!editor) return;
    if ("name" in changes || "role" in changes) editor.refreshUsers();
    if (editor.userId === user.id && ("name" in changes || "role" in changes)) editor.render({ window: { title: editor.title } });
  });
}

function userIdOf(li) {
  const el = li?.jquery ? li[0] : li;
  return el?.dataset?.userId ?? el?.closest?.("[data-user-id]")?.dataset.userId;
}

/**
 * Core's assignHotbarMacro rewrites the whole hotbar from the copy it has, so
 * two changes in flight at once lose one of them. The editor's changes go
 * through this queue, one after another, each reading the latest hotbar.
 */
let queue = Promise.resolve();

function assign(userId, macro, slot, options) {
  const run = () => game.users.get(userId)?.assignHotbarMacro(macro, slot, options);
  const next = queue.then(run);
  queue = next.catch(() => {});
  return next;
}

/** Whether a user can run a macro (Limited is enough; it hides the command). */
function canRun(macro, user) {
  return macro.canUserExecute?.(user) ?? macro.testUserPermission(user, "LIMITED");
}

/* -------------------------------------------- */
/*  Catching a system's "put it on my hotbar"   */
/* -------------------------------------------- */

/**
 * Systems (PF2e) build a macro from a drop on the hotbar and then call
 * game.user.assignHotbarMacro(macro, slot) with the slot they were given. The
 * editor passes each drop its own negative slot, which core rejects, and while
 * any are pending game.user.assignHotbarMacro is wrapped: a call for a pending
 * slot goes to that drop's handler instead; every other call passes through.
 * Each pending slot lapses after a minute (some branches never assign); a call
 * for one that has lapsed, while the wrapper is still in place, is reported
 * instead of reaching core, which would throw.
 */
const pending = new Map();
let nextKey = -100;
let installed = null;

function redirectAssign(handler) {
  const key = nextKey--;
  if (nextKey < -100000) nextKey = -100;
  const timer = setTimeout(() => finishRedirect(key), 60000);
  pending.set(key, { handler, timer });
  installRedirect();
  return key;
}

function finishRedirect(key) {
  const entry = pending.get(key);
  if (!entry) return null;
  clearTimeout(entry.timer);
  pending.delete(key);
  if (!pending.size) uninstallRedirect();
  return entry;
}

function installRedirect() {
  if (installed) return;
  const user = game.user;
  const original = user.assignHotbarMacro;
  const wrapper = function (macro, slot, options) {
    const key = Number(slot);
    const entry = finishRedirect(key);
    if (!entry) {
      if (key <= -100) {
        ui.notifications.error("BHE.Editor.DropFailed", { localize: true });
        return Promise.resolve();
      }
      return original.call(this, macro, slot, options);
    }
    return Promise.resolve()
      .then(() => entry.handler(macro))
      .catch(error => {
        console.error(`${MODULE_ID} |`, error);
        ui.notifications.error("BHE.Editor.DropFailed", { localize: true });
      });
  };
  user.assignHotbarMacro = wrapper;
  installed = { user, wrapper };
}

function uninstallRedirect() {
  if (!installed) return;
  // Leave it alone if something else has replaced it since.
  if (installed.user.assignHotbarMacro === installed.wrapper) delete installed.user.assignHotbarMacro;
  installed = null;
}

/* -------------------------------------------- */

let EditorClass = null;

/* ------------------------------------------------------------------ */
/* Window memory                                                      */
/* ------------------------------------------------------------------ */

/* The same code in each of Sir Bayard's modules. A window made with rememberWindow keeps the size and place the user
 * gives it, in this browser, and comes back from minimized whole: Foundry's restore animation can stall at the title
 * bar's height (seen on 14.370, core windows too) and Foundry sets the size while it runs, so a restored window came
 * back as a strip. */

/** Wait for an element's own transitions to end; a hidden tab pauses them, so after a second they're finished by hand. */
async function settleWindow(el) {
  const anims = el?.getAnimations?.() ?? [];
  if (!anims.length) return;
  await Promise.race([Promise.all(anims.map(a => a.finished.catch(() => null))), new Promise(r => setTimeout(r, 1200))]);
  for (const a of el.getAnimations?.() ?? []) {
    try {
      a.finish();
    } catch {
      /* an animation that can't finish (infinite) is left alone */
    }
  }
}

/**
 * Give an ApplicationV2 class window memory.
 * @param {typeof ApplicationV2} Base
 * @param {string} key          localStorage key for this window
 * @param {object} [opts]
 * @param {boolean|"width"} [opts.size] what to keep besides the place: true for width and height, "width" for a window
 *   whose height fits its content, false for a window sized wholly by its content
 */
function rememberWindow(Base, key, { size = true } = {}) {
  const MIN_W = 240, MIN_H = 120;
  const load = () => {
    let v;
    try {
      v = JSON.parse(globalThis.localStorage?.getItem(key) ?? "null");
    } catch {
      return {};
    }
    if (!v || typeof v !== "object") return {};
    const W = globalThis.innerWidth ?? 1920, H = globalThis.innerHeight ?? 1080;
    const out = {};
    // A size saved while the window was collapsed is no size at all.
    if (size === true && v.width >= MIN_W && v.height >= MIN_H) {
      out.width = Math.min(v.width, W);
      out.height = Math.min(v.height, H);
    } else if (size === "width" && v.width >= MIN_W) out.width = Math.min(v.width, W);
    const w = out.width ?? MIN_W, h = out.height ?? MIN_H;
    if (Number.isFinite(v.left)) out.left = Math.max(0, Math.min(v.left, W - w));
    if (Number.isFinite(v.top)) out.top = Math.max(0, Math.min(v.top, H - h));
    return out;
  };
  let timer = null;
  const save = position => {
    // Copy now: Foundry hands over its own live position object, which may change before the save runs.
    const pos = { left: position.left, top: position.top, width: position.width, height: position.height };
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const v = { left: pos.left, top: pos.top };
        if (size) v.width = pos.width;
        if (size === true) v.height = pos.height;
        globalThis.localStorage?.setItem(key, JSON.stringify(v));
      } catch {
        /* no storage: the window opens where Foundry puts it */
      }
    }, 300);
  };

  return class extends Base {
    #beforeMin = null;
    #restoring = false;
    #restore = null;

    constructor(options = {}) {
      super(foundry.utils.mergeObject({ position: load() }, options, { inplace: false }));
    }

    /** Restore a minimized window before drawing it: a draw that ends while it's collapsed takes the title bar's size. */
    async render(options = {}, _options = {}) {
      if ((this.minimized || this.#restore) && (options === true || options?.force)) {
        const open = this.rendered;
        await this.maximize();
        // Closed while it was being restored: don't open it again.
        if (open && !this.rendered) return this;
      }
      return super.render(options, _options);
    }

    async minimize() {
      if (!this.minimized && this.rendered) {
        const auto = this.options.position ?? {};
        this.#beforeMin = {
          width: auto.width === "auto" ? "auto" : this.position.width,
          height: auto.height === "auto" ? "auto" : this.position.height
        };
      }
      return super.minimize();
    }

    maximize() {
      // A restore already under way is the one to wait for.
      if (this.#restore) return this.#restore;
      if (!this.minimized) return super.maximize();
      this.#restore = this.#restoreWhole().finally(() => (this.#restore = null));
      return this.#restore;
    }

    async #restoreWhole() {
      const was = this.#beforeMin;
      this.#restoring = true;
      try {
        const pending = super.maximize();
        for (const a of this.element?.getAnimations?.() ?? []) {
          try {
            a.finish();
          } catch {
            /* nothing to finish */
          }
        }
        await pending;
        await settleWindow(this.element);
        // Not if it was closed or minimized again meanwhile.
        if (was && this.rendered && !this.minimized) this.setPosition(was);
      } finally {
        this.#restoring = false;
      }
    }

    /** Remember the size and place the user gives the window (not while it's minimized or being restored). */
    _onPosition(position) {
      super._onPosition?.(position);
      if (!this.rendered || this.minimized || this.#restoring) return;
      if (![position.left, position.top].every(Number.isFinite)) return;
      if (size && !(position.width >= MIN_W)) return;
      if (size === true && !(position.height >= MIN_H)) return;
      save(position);
    }
  };
}

function defineEditor() {
  if (EditorClass) return EditorClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  // Sized by its grid, so it keeps only its place.
  EditorClass = class HotbarEditor extends rememberWindow(HandlebarsApplicationMixin(ApplicationV2), `${MODULE_ID}.editor`, { size: false }) {
    constructor(options) {
      super(options);
      this.userId = options.userId;
    }

    static DEFAULT_OPTIONS = {
      classes: ["bhe-editor"],
      tag: "section",
      window: { icon: "fa-solid fa-table-cells", resizable: false },
      position: { width: "auto", height: "auto" },
      actions: {
        slot: HotbarEditor.#onSlot,
        macroDirectory: HotbarEditor.#onMacroDirectory
      }
    };

    static PARTS = {
      grid: { template: TEMPLATE }
    };

    /**
     * The user shown. Looked up each time: Foundry replaces a User object when
     * its role changes, and an old object would hold a stale hotbar.
     */
    get user() {
      return game.users.get(this.userId) ?? null;
    }

    /** The User object this window is registered on (in its `apps`). */
    #registeredOn = null;

    /** Set as soon as a close starts (Foundry's own state changes later). */
    closing = false;

    /** @override */
    async close(options) {
      this.closing = true;
      if (editor === this) editor = null;
      return super.close(options);
    }

    /** A new macro is being made; ignore further clicks until it exists. */
    #creating = false;

    /** The user list the picker was last built from. */
    #pickerKey = null;

    /** @override */
    get title() {
      return game.i18n.format("BHE.Editor.Title", { name: this.user?.name ?? "" });
    }

    /** A Macro Directory button in the title bar. */
    _getFrameButtons(options) {
      return [
        ...super._getFrameButtons(options),
        { icon: "fa-solid fa-code", label: "BHE.Editor.MacroDirectory", action: "macroDirectory" }
      ];
    }

    /** The title bar's user picker sits beside the (visually hidden) title. */
    async _renderFrame(options) {
      const frame = await super._renderFrame(options);
      const title = frame.querySelector(".window-title");
      if (title) {
        const select = document.createElement("select");
        select.className = "bhe-editor-user";
        select.setAttribute("aria-label", game.i18n.localize("BHE.Editor.User"));
        // The title bar drags the window and a double click minimizes it; not on the picker.
        for (const type of ["pointerdown", "dblclick"]) select.addEventListener(type, e => e.stopPropagation());
        select.addEventListener("change", () => {
          const next = game.users.get(select.value);
          if (next) this.switchUser(next);
          else this.refreshUsers(true);
        });
        title.after(select);
      }
      return frame;
    }

    /** Show another user's hotbar in this window. */
    switchUser(user) {
      if (user.id === this.userId) return this.render({ force: true });
      this.userId = user.id;
      return this.render({ force: true, window: { title: this.title } });
    }

    /** Rebuild the picker if the user list changed (or when forced). */
    refreshUsers(force = false) {
      const select = this.element?.querySelector(".bhe-editor-user");
      if (!select) return;
      const users = game.users.contents.slice().sort((a, b) => (a.isGM - b.isGM) || a.name.localeCompare(b.name));
      const key = users.map(u => `${u.id}:${u.name}:${u.isGM}`).join("|");
      if (force || key !== this.#pickerKey) {
        this.#pickerKey = key;
        select.replaceChildren(...users.map(u => {
          const option = document.createElement("option");
          option.value = u.id;
          option.textContent = u.isGM ? game.i18n.format("BHE.Editor.GMUser", { name: u.name }) : u.name;
          return option;
        }));
      }
      if (select.value !== this.userId) select.value = this.userId;
    }

    static #onMacroDirectory() {
      const tab = ui.macros;
      if (tab?.renderPopout) tab.renderPopout();
      else ui.sidebar?.changeTab?.("macros", "primary");
    }

    /** @override */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const user = this.user;
      const pages = [];
      if (user) for (let page = 1; page <= PAGE_COUNT; page++) {
        const slots = user.getHotbarMacros(page).map((entry, i) => {
          const macro = entry.macro;
          const position = game.i18n.format("BHE.Editor.Position", { page, slot: i + 1 });
          const hidden = macro ? !canRun(macro, user) : false;
          const hiddenText = game.i18n.localize("BHE.Editor.Hidden");
          return {
            slot: entry.slot,
            key: i < 9 ? i + 1 : 0,
            img: macro?.img ?? null,
            name: macro?.name ?? null,
            tooltip: macro ? (hidden ? `${macro.name} (${hiddenText})` : macro.name) : null,
            label: macro
              ? `${position}: ${macro.name}${hidden ? ` (${hiddenText})` : ""}`
              : `${position}: ${game.i18n.localize("BHE.Editor.Empty")}`,
            cssClass: macro ? "full" : "open",
            hidden
          };
        });
        pages.push({ page, slots });
      }
      return Object.assign(context, { pages, size: PAGE_SIZE });
    }

    /** Re-render when the shown user's hotbar or any macro changes, hooks or not. */
    #register() {
      const user = this.user;
      if (this.#registeredOn && this.#registeredOn !== user && this.#registeredOn.apps[this.id] === this) {
        delete this.#registeredOn.apps[this.id];
      }
      if (user) user.apps[this.id] = this;
      this.#registeredOn = user;
      if (!game.macros.apps.includes(this)) game.macros.apps.push(this);
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      this._createContextMenu(this.#menuOptions, ".slot.full", {
        fixed: true,
        hookName: "getBheEditorSlotOptions",
        parentClassHooks: false
      });
    }

    /** @override */
    _onClose(options) {
      super._onClose(options);
      if (this.#registeredOn?.apps[this.id] === this) delete this.#registeredOn.apps[this.id];
      this.#registeredOn = null;
      const i = game.macros.apps.indexOf(this);
      if (i >= 0) game.macros.apps.splice(i, 1);
      if (editor === this) editor = null;
    }

    /** @override */
    async _onRender(context, options) {
      await super._onRender(context, options);
      // Not awaited: render and close share one queue, and this render is in it.
      if (!this.user) {
        queueMicrotask(() => this.close());
        return;
      }
      this.#register();
      this.refreshUsers();
      const root = this.element;
      for (const li of root.querySelectorAll(".slot")) {
        li.addEventListener("dragover", event => {
          event.preventDefault();
          li.classList.add("drop-target");
        });
        li.addEventListener("dragleave", () => li.classList.remove("drop-target"));
        li.addEventListener("drop", event => this.#onDrop(event, li));
        if (li.classList.contains("full")) li.addEventListener("dragstart", event => this.#onDragStart(event, li));
      }
      // The window's element survives re-renders, so bind these once.
      if (root.dataset.bheBound) return;
      root.dataset.bheBound = "1";
      // Shift+right-click deletes the macro (after Foundry's confirm), instead of the
      // menu. Armed by the mouse button itself, so Shift+F10 (the keyboard's context
      // menu key) still opens the menu.
      let shiftRightClick = false;
      root.addEventListener("pointerdown", event => {
        shiftRightClick = event.button === 2 && event.shiftKey;
      }, { capture: true });
      root.addEventListener("contextmenu", event => {
        const armed = shiftRightClick;
        shiftRightClick = false;
        const li = event.target.closest(".slot.full");
        if (!li || !armed || !event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        this.#delete(li);
      }, { capture: true });
      // Enter or Space on a focused slot acts like a click.
      root.addEventListener("keydown", event => {
        const li = event.target.closest?.(".slot");
        if (!li || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        li.click();
      });
    }

    /** Report an error from one of the editor's own actions. */
    #report(error, key = "BHE.Editor.Failed") {
      console.error(`${MODULE_ID} |`, error);
      ui.notifications.error(key, { localize: true });
    }

    /* ------------------------------------------ */

    #macroAt(li, user = this.user) {
      const id = user?.hotbar[li.dataset.slot];
      return id ? game.macros.get(id) ?? null : null;
    }

    /** Delete a slot's macro (Foundry asks to confirm), then clear the slot. */
    async #delete(li) {
      try {
        await this.#deleteSlot(li);
      } catch (error) {
        this.#report(error);
      }
    }

    async #deleteSlot(li) {
      const user = this.user;
      const macro = this.#macroAt(li, user);
      if (!macro) return;
      const slot = li.dataset.slot;
      await macro.deleteDialog();
      if (!game.macros.has(macro.id) && game.users.get(user.id)?.hotbar[slot] === macro.id) {
        await assign(user.id, null, Number(slot));
      }
    }

    #menuOptions() {
      return [
        {
          label: "MACRO.Edit",
          icon: '<i class="fa-solid fa-edit"></i>',
          onClick: (_event, li) => this.#macroAt(li)?.sheet.render({ force: true })
        },
        {
          label: "BHE.Editor.Remove",
          icon: '<i class="fa-solid fa-xmark"></i>',
          onClick: (_event, li) => assign(this.userId, null, Number(li.dataset.slot)).catch(error => this.#report(error))
        },
        {
          label: "MACRO.Delete",
          icon: '<i class="fa-solid fa-trash"></i>',
          onClick: (_event, li) => this.#delete(li)
        }
      ];
    }

    /**
     * Click a full slot to edit its macro; an empty one to make a new macro
     * there. A new macro closed without a name or command is removed again.
     */
    static async #onSlot(event, target) {
      const user = this.user;
      if (!user) return;
      const macro = this.#macroAt(target, user);
      if (macro) return macro.sheet.render({ force: true });
      if (this.#creating) return;
      this.#creating = true;
      try {
        const cls = CONFIG.Macro.documentClass;
        const name = cls.defaultName({ type: "script" });
        const created = await cls.create({ name, type: "script", scope: "global", img: "icons/svg/dice-target.svg" });
        if (!created) return;
        const slot = Number(target.dataset.slot);
        await this.#place(created, user, slot, undefined, { quiet: true });
        const sheet = created.sheet;
        sheet.addEventListener?.("close", async () => {
          if (!game.macros.has(created.id)) return;
          if (created.name === name && !created.command) {
            if (game.users.get(user.id)?.hotbar[slot] === created.id) await assign(user.id, null, slot);
            await created.delete();
          }
        }, { once: true });
        await sheet.render({ force: true });
      } catch (error) {
        this.#report(error);
      } finally {
        this.#creating = false;
      }
    }

    #onDragStart(event, li) {
      const macro = this.#macroAt(li);
      if (!macro) return event.preventDefault();
      // Not core's "slot" key: core would read it as a slot on the GM's own hotbar.
      const data = foundry.utils.mergeObject(macro.toDragData(), { bheEditor: this.userId, bheSlot: li.dataset.slot });
      event.dataTransfer.setData("text/plain", JSON.stringify(data));
    }

    async #onDrop(event, li) {
      event.preventDefault();
      li.classList.remove("drop-target");
      try {
        await this.#drop(event, li);
      } catch (error) {
        this.#report(error, "BHE.Editor.DropFailed");
      }
    }

    async #drop(event, li) {
      const user = this.user;
      if (!user) return;
      const slot = Number(li.dataset.slot);
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (!data?.type) return;

      // Anything but a macro or table: let the system build its macro (PF2e strikes,
      // actions, toggles, effects, items), as it does for core's hotbar, then catch
      // its "put it on my hotbar" call and place the macro here instead.
      if (data.type !== "Macro" && data.type !== "RollTable") {
        const key = redirectAssign(async macro => {
          if (!macro) return;
          const now = game.users.get(user.id);
          if (!now) return;
          await this.#place(macro, now, slot);
          // Warn when it uses an item or actor the player can't see (not for compendium entries).
          const source = data.uuid ?? data.actorUUID;
          if (source && !String(source).startsWith("Compendium.")) {
            const target = await fromUuid(source).catch(() => null);
            if (target) this.#checkTarget(target, data.type, now);
          }
        });
        if (Hooks.call("hotbarDrop", this, data, key) === false) return;
        // A handler that placed its macro but didn't return false: done.
        if (!finishRedirect(key)) return;
      }

      const cls = CONFIG[data.type]?.documentClass;
      if (!cls?.fromDropData) {
        ui.notifications.warn(game.i18n.format("BHE.Editor.Unsupported", { type: data.type }));
        return;
      }
      const doc = await cls.fromDropData(data);
      if (!doc) return;

      // A move within this editor, or from the GM's own hotbar when editing it.
      let fromSlot;
      if (data.bheEditor === user.id) fromSlot = Number(data.bheSlot);
      else if (user.id === game.user.id && data.slot) fromSlot = Number(data.slot);
      if (fromSlot === slot) return;

      let macro;
      if (data.type === "Macro") {
        if (doc.pack) macro = await cls.create(game.macros.fromCompendium(doc));
        else macro = game.macros.has(doc.id) ? doc : await cls.create(doc.toObject());
      } else if (data.type === "RollTable") macro = await ui.hotbar._createRollTableRollMacro(doc);
      else macro = await ui.hotbar._createDocumentSheetToggle(doc);
      if (!macro) return;
      const now = game.users.get(user.id);
      if (!now) return;
      // Only a move if that slot still holds the macro that was dragged.
      if (fromSlot && now.hotbar[fromSlot] !== macro.id) fromSlot = undefined;
      await this.#place(macro, now, slot, fromSlot);
      if (data.type !== "Macro") this.#checkTarget(doc, data.type, now);
    }

    /** Warn when a macro will open or use something the player can't see. */
    #checkTarget(doc, type, user) {
      if (!doc || user.isGM) return;
      const level = type === "RollTable" ? "OBSERVER" : "LIMITED";
      const owner = doc.parent ?? doc;
      if (owner.testUserPermission?.(user, level) ?? true) return;
      ui.notifications.warn(game.i18n.format("BHE.Editor.TargetHidden", { name: user.name, document: doc.name }));
    }

    /** Put a macro in a slot of a user's hotbar, sharing it with them if they can't run it. */
    async #place(macro, user, slot, fromSlot, { quiet = false } = {}) {
      if (!user.isGM && !canRun(macro, user)) {
        await macro.update({ [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
        if (!quiet) ui.notifications.info(game.i18n.format("BHE.Editor.Shared", { macro: macro.name, name: user.name }));
      }
      // Queued, and against the latest User object (a role change replaces it).
      await assign(user.id, macro, slot, { fromSlot });
    }
  };
  return EditorClass;
}
