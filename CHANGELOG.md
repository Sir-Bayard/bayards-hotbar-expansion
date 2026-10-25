# Changelog

## 0.3.0

- **Edit any user's hotbar (GM).** Right-click a user in the Players list and choose "Edit hotbar": a window with all five pages of their hotbar. Drop macros (or roll tables, items and other documents) on it, drag to move or swap, click to edit or to make a new macro in an empty slot, right-click to remove from the slot or delete, Shift+right-click to delete. A macro you put on a player's hotbar that they can't see is shared with them (Observer). It replaces the hotbar-editing part of the Macro Grid module.

## 0.2.0

- **The second row is now off until you turn it on.** After updating, tick "Show the second row" in Configure Settings, under this module, to get it back. Each user (GM or player) decides for themselves, and turning it off puts the hotbar and the chat input back as they were, without a reload.
- When the second row reaches under the right-hand column, the bottom of the whole column moves up: Foundry's floating chat input and panels docked under it, such as PF2e HUD's combat tracker, together. The second row keeps full-size slots. The setting is now called "Lift panels at the bottom right"; with it off, the second row shrinks to stop before those panels instead.
- In Foundry's layout the two rows sit level when another module changes the hotbar's bottom margin (PF2e HUD does, even with its persistent HUD off).
- README: pictures of the rows inside PF2e HUD and in Foundry's own layout, the settings and the accent colors.

## 0.1.0

- First release: a second hotbar row beside the first, showing any of the five hotbar pages.
- Its own page selector (pages 1 to 5, remembered for your user), separate from the first row's.
- Keys Alt+Shift+1 to Alt+Shift+0 for the second row's slots, changeable in Configure Controls.
- Setting "Second row: slots shown" (1 to 10, default 10), per browser.
- Optional accent color for the second row (Crimson, Violet, Blue, Green, Black, your player color or a custom color) with a strength setting, per user, shown live on the row while you change them in the settings window. Off by default.
- Sits beside the first row in Foundry's layout and inside PF2e HUD's persistent HUD (left or middle), styled to match.
- Stays clear of the sidebar on narrow screens (and of the player list in Foundry's layout): slides over first, then shrinks its slots.
- Lifts Foundry's floating chat input clear of the second row (setting "Lift the floating chat input", on by default).
