# Bayard's Hotbar Expansion

A second hotbar row beside the first. It shows any of the five hotbar pages, with its own page selector, its own keys, a slot count you choose and an optional accent color. It works with Foundry's own layout and with PF2e HUD's persistent HUD. It also opens a whole hotbar for editing: any user's for the GM, your own for a player.

## What it looks like

![Inside PF2e HUD](docs/images/hud.png)

**Inside PF2e HUD.** The second row on page 2, with the Violet accent, styled the way the HUD styles the hotbar.

![Foundry's own layout](docs/images/core.png)

**Foundry's own layout.** Both rows side by side, no accent.

![The settings](docs/images/settings.png)

**The settings.** Each user turns the row on for themselves; while it's off, the rest are grayed out. The accent shows on the row while you pick it.

![Accent colors](docs/images/accents.png)

**Accent colors.** The five presets and a custom color; your player color is the other choice.

![The hotbar editor](docs/images/editor.png)

**The hotbar editor.** A player's five pages at once. The red border marks a macro the player can't run; the eye marks the page on their second row.

## Install

In Foundry, go to **Add-on Modules**, then **Install Module**, and paste this into **Manifest URL**:

```
https://github.com/Sir-Bayard/bayards-hotbar-expansion/releases/latest/download/module.json
```

Foundry's **Update** button then picks up each new release. You can also download `module.zip` from the [latest release](https://github.com/Sir-Bayard/bayards-hotbar-expansion/releases/latest) and unzip it into `Data/modules/bayards-hotbar-expansion`.

Requires Foundry VTT 14 (verified on 14.370). It works with any game system.

The second row is off until you turn it on: after enabling the module, each user who wants it ticks **Show the second row** in **Configure Settings**, under this module.

## What it does

Foundry keeps 50 hotbar slots per user, on five pages of ten, and shows one page at a time. The second row shows another page at the same time.

- **Each user decides.** GM or player, each turns it on for themselves, on any computer. Turning it off puts everything back.
- **The same hotbar.** Nothing new is stored. Click, drop, drag between slots and rows, and right-click, as on the first row. The hotbar lock applies to both.
- **Its own page.** Its arrows flip it through pages 1 to 5 without touching the first row; so do the mouse wheel over them and Alt+Shift+Up and Down. Click the page number to pick a page. It starts on page 2 and remembers where you leave it.
- **Its own keys.** Alt+Shift+1 to Alt+Shift+0 run its slots; a slot's tooltip names its key. Change them in **Configure Controls**. Alt+1 to 5 still switch the first row's page.
- **Slot count.** Show 1 to 10 slots ("Slots shown", per browser).

With the row off, its other settings are grayed out.

## Accent color

An accent color tells the rows apart at a glance ("Accent color"):

- It colors the slot borders, number badges and page selector, and tints the empty slots.
- Crimson, Violet, Blue, Green, Charcoal, your player color or a custom color; "Accent strength" sets 10% to 60%. The default, none, looks like the first row.
- It shows on the row as you change it in the settings window, and goes back if you close without saving. Each user picks their own.

## Where it sits

- **Foundry's layout:** both rows side by side, centered at the bottom.
- **PF2e HUD's persistent HUD:** right after the first row, styled to match.
- **Narrow screens:** the row slides over, then shrinks its slots to about half size, to stay clear of the sidebar and the player list. A very narrow screen may still not fit both; show fewer slots.
- **The bottom right:** when the row reaches under the right-hand column (the floating chat input, PF2e HUD's combat tracker), the column moves up. Turn off "Lift panels at the bottom right" to have the row shrink instead.
- When the first row is hidden, so is the second.

## Edit a whole hotbar

Right-click a user in the Players list and choose **Edit Hotbar**: a window with all five pages of their hotbar, updated as they change it. A GM can open anyone's, and the name in the title bar switches to another user; a player can open their own (right-click your own name). The button in the title bar opens the Macro Directory. An eye beside a page number marks the page on that user's second row.

- **Add:** drop a macro from the Macro Directory or a compendium (imported into the world). Anything else becomes a macro as it would on Foundry's hotbar: in Pathfinder 2e, strikes, actions, items, conditions and effects become PF2e's own macros; roll tables a draw macro; other documents a macro that opens their sheet.
- **Move:** drag to another slot or page; a filled slot swaps.
- **Edit:** click a macro to open it. On an empty slot, click the **+** to make a new one (closed with no name or command, it's removed again).
- **Remove or delete:** right-click for Edit, Remove from Slot (the macro stays in the world) and Delete. Shift+right-click deletes (Foundry asks first). A player can delete only their own macros.
- **Copy or clear a page:** click a page number. A GM can copy any page of any user's hotbar onto it, or a whole hotbar onto this one (an exact copy, empty slots included). **Clear Page** empties it; the macros stay in the world.
- **What it shares for you (GM):** a player can run a macro they have Limited permission on, which hides its command. One you put on their hotbar that they can't run is shared with them as Limited, with a note. Macros shared as Observer before 0.5.0 stay that way until you change them. One already there that they can't run has a red border and an eye-slash mark.
- **What it can't fix:** a macro made from an item, a strike or a journal entry also needs the player to be able to open that item, character or entry. You're warned when they can't. And if a player changes their hotbar at the very moment you copy onto it, one of the two changes can be lost.

## Other modules

- The second row is Foundry's own hotbar underneath, so modules that react to `renderHotbar` (interface themes, say) see it too.
- The editor passes drops it doesn't handle to the `hotbarDrop` hook (with `ui.hotbar` as the hotbar), so the game system builds its macros. A handler that writes the current user's hotbar directly, instead of calling `assignHotbarMacro`, can't place its macro from the editor.

## API

`game.modules.get("bayards-hotbar-expansion").api`:

- `bar`: the second row, or `null` while it's off. `bar.changePage(3)` shows page 3; `bar.page` is the page shown.
- `executeSlot(n)`: runs slot n (1 to 10) of the second row's page.
- `editHotbar(user)`: opens the editor on a user (a User or a user id): any user for a GM, only their own for a player.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## How it was made

This module was written with Claude, Anthropic's AI assistant, directed and tested by its author at a real table. It is shared as is, for free.

## Problems and suggestions

Open an [issue](https://github.com/Sir-Bayard/bayards-hotbar-expansion/issues).

## License

[MIT](LICENSE). Copyright (c) 2026 Sir Bayard.

## Pathfinder

Bayard's Hotbar Expansion is an unofficial, free module for Foundry VTT. It is not published, endorsed or specifically approved by Paizo Inc. Pathfinder is a trademark of Paizo Inc., named here only because the module works alongside PF2e HUD, a module for the Pathfinder Second Edition system. The module contains no Paizo rules text, art or setting material.
