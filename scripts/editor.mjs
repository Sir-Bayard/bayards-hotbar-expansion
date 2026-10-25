/**
 * The GM's hotbar editor: one user's whole hotbar (five pages of ten) in a
 * window, opened from the Players list. Drop macros on it, move them between
 * slots and pages, create, edit, remove and delete them. A macro put on a
 * player's hotbar that they can't run is shared with them (Observer).
 */

import { PAGE_COUNT, PAGE_SIZE } from "./helpers.mjs";

const MODULE_ID = "bayards-hotbar-expansion";
const TEMPLATE = `modules/${MODULE_ID}/templates/editor.hbs`;

/** Editors being opened or open, by user id (guards against a double open). */
const editors = new Map();

/** Open (or bring forward) the editor for a user. GM only. */
export function openHotbarEditor(user) {
  if (!game.user.isGM) {
    ui.notifications.warn("BHE.Editor.GMOnly", { localize: true });
    return null;
  }
  const target = typeof user === "string" ? game.users.get(user) : user;
  if (!target) return null;
  const existing = editors.get(target.id);
  if (existing) {
    // Still opening: the first render will show it.
    if (!existing.rendered) return existing;
    existing.render({ force: true });
    existing.bringToFront?.();
    return existing;
  }
  const Editor = defineEditor();
  const app = new Editor({ id: `bhe-editor-${target.id}`, user: target });
  editors.set(target.id, app);
  app.render({ force: true });
  return app;
}

/** The Players list: "Edit hotbar" on each user, for the GM. */
export function addUserContextOption(_app, options) {
  options.push({
    label: "BHE.Editor.Menu",
    icon: '<i class="fa-solid fa-table-cells"></i>',
    visible: () => game.user.isGM,
    onClick: (_event, li) => openHotbarEditor(userIdOf(li))
  });
}

function userIdOf(li) {
  const el = li?.jquery ? li[0] : li;
  return el?.dataset?.userId ?? el?.closest?.("[data-user-id]")?.dataset.userId;
}

/** Whether a user can run a macro (Limited is enough; it hides the command). */
function canRun(macro, user) {
  return macro.canUserExecute?.(user) ?? macro.testUserPermission(user, "LIMITED");
}

/* -------------------------------------------- */

let EditorClass = null;

function defineEditor() {
  if (EditorClass) return EditorClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  EditorClass = class HotbarEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
      super(options);
      this.user = options.user;
    }

    static DEFAULT_OPTIONS = {
      classes: ["bhe-editor"],
      tag: "section",
      window: { icon: "fa-solid fa-table-cells", resizable: false },
      position: { width: "auto", height: "auto" },
      actions: {
        slot: HotbarEditor.#onSlot
      }
    };

    static PARTS = {
      grid: { template: TEMPLATE }
    };

    /** A new macro is being made; ignore further clicks until it exists. */
    #creating = false;

    /** @override */
    get title() {
      return game.i18n.format("BHE.Editor.Title", { name: this.user.name });
    }

    /** @override */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const pages = [];
      for (let page = 1; page <= PAGE_COUNT; page++) {
        const slots = this.user.getHotbarMacros(page).map((entry, i) => {
          const macro = entry.macro;
          const position = game.i18n.format("BHE.Editor.Position", { page, slot: i + 1 });
          const hidden = macro ? !canRun(macro, this.user) : false;
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

    /** Re-render when the user's hotbar or any macro changes, hooks or not. */
    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      this.user.apps[this.id] = this;
      if (!game.macros.apps.includes(this)) game.macros.apps.push(this);
      this._createContextMenu(this.#menuOptions, ".slot.full", {
        fixed: true,
        hookName: "getBheEditorSlotOptions",
        parentClassHooks: false
      });
    }

    /** @override */
    _onClose(options) {
      super._onClose(options);
      if (this.user.apps[this.id] === this) delete this.user.apps[this.id];
      const i = game.macros.apps.indexOf(this);
      if (i >= 0) game.macros.apps.splice(i, 1);
      if (editors.get(this.user.id) === this) editors.delete(this.user.id);
    }

    /** @override */
    async _onRender(context, options) {
      await super._onRender(context, options);
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
      // Shift+right-click deletes the macro (after Foundry's confirm), instead of the menu.
      root.addEventListener("contextmenu", event => {
        const li = event.target.closest(".slot.full");
        if (!li || !event.shiftKey) return;
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

    /* ------------------------------------------ */

    #macroAt(li) {
      const id = this.user.hotbar[li.dataset.slot];
      return id ? game.macros.get(id) ?? null : null;
    }

    /** Delete a slot's macro (Foundry asks to confirm), then clear the slot. */
    async #delete(li) {
      const macro = this.#macroAt(li);
      if (!macro) return;
      const slot = li.dataset.slot;
      await macro.deleteDialog();
      if (!game.macros.has(macro.id) && this.user.hotbar[slot] === macro.id) {
        await this.user.assignHotbarMacro(null, Number(slot));
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
          onClick: (_event, li) => this.user.assignHotbarMacro(null, Number(li.dataset.slot))
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
      const macro = this.#macroAt(target);
      if (macro) return macro.sheet.render({ force: true });
      if (this.#creating) return;
      this.#creating = true;
      try {
        const cls = CONFIG.Macro.documentClass;
        const name = cls.defaultName({ type: "script" });
        const created = await cls.create({ name, type: "script", scope: "global", img: "icons/svg/dice-target.svg" });
        if (!created) return;
        const slot = Number(target.dataset.slot);
        await this.#place(created, slot, undefined, { quiet: true });
        const sheet = created.sheet;
        sheet.addEventListener?.("close", async () => {
          if (!game.macros.has(created.id)) return;
          if (created.name === name && !created.command) {
            if (this.user.hotbar[slot] === created.id) await this.user.assignHotbarMacro(null, slot);
            await created.delete();
          }
        }, { once: true });
        await sheet.render({ force: true });
      } finally {
        this.#creating = false;
      }
    }

    #onDragStart(event, li) {
      const macro = this.#macroAt(li);
      if (!macro) return event.preventDefault();
      // Not core's "slot" key: core would read it as a slot on the GM's own hotbar.
      const data = foundry.utils.mergeObject(macro.toDragData(), { bheEditor: this.user.id, bheSlot: li.dataset.slot });
      event.dataTransfer.setData("text/plain", JSON.stringify(data));
    }

    async #onDrop(event, li) {
      event.preventDefault();
      li.classList.remove("drop-target");
      const slot = Number(li.dataset.slot);
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (!data?.type) return;
      const cls = CONFIG[data.type]?.documentClass;
      if (!cls?.fromDropData) {
        ui.notifications.warn(game.i18n.format("BHE.Editor.Unsupported", { type: data.type }));
        return;
      }
      const doc = await cls.fromDropData(data);
      if (!doc) return;

      // A move within this editor, or from the GM's own hotbar when editing it.
      let fromSlot;
      if (data.bheEditor === this.user.id) fromSlot = Number(data.bheSlot);
      else if (this.user === game.user && data.slot) fromSlot = Number(data.slot);
      if (fromSlot === slot) return;

      let macro;
      if (data.type === "Macro") {
        if (doc.pack) macro = await cls.create(game.macros.fromCompendium(doc));
        else macro = game.macros.has(doc.id) ? doc : await cls.create(doc.toObject());
      } else if (data.type === "RollTable") macro = await ui.hotbar._createRollTableRollMacro(doc);
      else macro = await ui.hotbar._createDocumentSheetToggle(doc);
      if (!macro) return;
      // Only a move if that slot still holds the macro that was dragged.
      if (fromSlot && this.user.hotbar[fromSlot] !== macro.id) fromSlot = undefined;
      await this.#place(macro, slot, fromSlot);
      if (data.type !== "Macro") this.#checkTarget(doc, data.type);
    }

    /** Warn when a macro will open something the player can't see. */
    #checkTarget(doc, type) {
      if (this.user.isGM) return;
      const level = type === "RollTable" ? "OBSERVER" : "LIMITED";
      const owner = doc.parent ?? doc;
      if (owner.testUserPermission?.(this.user, level)) return;
      ui.notifications.warn(game.i18n.format("BHE.Editor.TargetHidden", { name: this.user.name, document: doc.name }));
    }

    /** Put a macro in a slot of this user's hotbar, sharing it with them if they can't run it. */
    async #place(macro, slot, fromSlot, { quiet = false } = {}) {
      if (!this.user.isGM && !canRun(macro, this.user)) {
        await macro.update({ [`ownership.${this.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
        if (!quiet) ui.notifications.info(game.i18n.format("BHE.Editor.Shared", { macro: macro.name, name: this.user.name }));
      }
      await this.user.assignHotbarMacro(macro, slot, { fromSlot });
    }
  };
  return EditorClass;
}
