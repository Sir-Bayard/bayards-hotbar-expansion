# Changelog

## 0.5.0

**Two changes to how the hotbar editor works:**

- **Macros are shared as Limited, not Observer.** A macro a GM puts on a player's hotbar that the player can't run is now shared with them as Limited: they can run it but can't read its command. Macros shared as Observer by earlier versions stay Observer until you change their permissions.
- **Players can open the editor on their own hotbar.** Right-click your own name in the Players list and choose Edit Hotbar. A player sees only their own hotbar, shares nothing and can delete only their own macros. Until now only a GM could open it.

**New**

- In the editor, click a page number to copy a page from any user's hotbar, copy a whole hotbar, or clear the page. Copies are exact, empty slots included, and macros the player can't run are shared as Limited. Copying is for the GM; a player can clear their own pages.
- New macros come from a **+** on an empty slot, not from any click on it. A blank new macro left behind by a reload or a closed browser is cleared up later.
- The editor marks the page each user has on their second row.
- Second row: Alt+Shift+Up and Alt+Shift+Down flip its page, clicking its page number picks a page, the mouse wheel over its page selector flips pages, and a full slot's tooltip names its key.
- Settings lose the "Second row:" prefix, and while the row is off its other settings are grayed out.
- The Black accent is now Charcoal, light enough to see on dark slots.
- The accent tint no longer replaces a theme's own slot shadow or glow.
- The editor's help is one line.

**Fixed**

- Turning the second row on and off in quick succession no longer shows an error or leaves the row half on: it always ends as the setting says.
- In the hotbar editor, dragging a macro from your own hotbar onto the first or second row moves it there, as a drag between the rows does, instead of copying it.
- Inside PF2e HUD, the second row keeps a usable size and look if a PF2e HUD update renames the styles it borrows.
- The message for something the editor can't put on a hotbar now says what kind of thing was dropped.
- Remove from Slot removes only the macro you opened the menu on; if the slot has changed since, it says so and removes nothing.
- The second row does far less work while other windows redraw (PF2e HUD in combat, for one), with its layout unchanged, and no longer redraws when the first row changes page.
- Modules that react to hotbar drops get Foundry's hotbar from the editor, not the editor window.

## 0.4.0

- The GM's hotbar editor opens where you last put it, in each browser (it sizes itself to the grid).
- Restoring a window from minimized brings it back at its full size; on Foundry 14.370 it came back as a thin strip.
- Verified on Foundry 14.370.

## 0.3.0

- **Edit any user's hotbar (GM).** Right-click a user in the Players list and choose "Edit Hotbar": a window with all five pages of their hotbar.
- Drop macros on it, or anything Foundry's hotbar takes (in PF2e: strikes, actions, items, conditions and effects, built the way PF2e builds them). Drag to move or swap.
- Click a macro to edit it, or an empty slot to make a new macro there. Right-click to remove it from the slot or delete it; Shift+right-click deletes.
- A macro you put on a player's hotbar that they can't run is shared with them (Observer); one they already have Limited permission on is left alone. You're warned when a macro made from an item, a strike or a journal entry points at something the player can't open.
- Pick another user from the name in the title bar to switch the window to their hotbar; a title-bar button opens the Macro Directory.

## 0.2.0

- **The second row is now off until you turn it on.** After updating, tick "Show the second row" in Configure Settings, under this module, to get it back. Each user (GM or player) decides for themselves, and turning it off puts the hotbar and the chat input back as they were, without a reload.
- When the second row reaches under the right-hand column, the bottom of the whole column moves up: Foundry's floating chat input and panels docked under it, such as PF2e HUD's combat tracker, together. The second row keeps full-size slots. The setting is now called "Lift panels at the bottom right"; with it off, the second row shrinks to stop before those panels instead.
- In Foundry's layout the two rows sit level when another module changes the hotbar's bottom margin (PF2e HUD does, even with its persistent HUD off).

## 0.1.0

- First release: a second hotbar row beside the first, showing any of the five hotbar pages.
- Its own page selector (pages 1 to 5, remembered for your user), separate from the first row's.
- Keys Alt+Shift+1 to Alt+Shift+0 for the second row's slots, changeable in Configure Controls.
- Setting "Second row: slots shown" (1 to 10, default 10), per browser.
- Optional accent color for the second row (Crimson, Violet, Blue, Green, Black, your player color or a custom color) with a strength setting, per user, shown live on the row while you change them in the settings window. Off by default.
- Sits beside the first row in Foundry's layout and inside PF2e HUD's persistent HUD (left or middle), styled to match.
- Stays clear of the sidebar on narrow screens (and of the player list in Foundry's layout): slides over first, then shrinks its slots.
- Lifts Foundry's floating chat input clear of the second row (setting "Lift the floating chat input", on by default).
