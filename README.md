# Bayard's Hotbar Expansion

A second hotbar row beside the first. It shows any of the five hotbar pages, with its own page selector, its own keys and a slot count you choose. It works with Foundry's own layout and with PF2e HUD's persistent HUD.

## Install

In Foundry, go to **Add-on Modules**, then **Install Module**, and paste this into **Manifest URL**:

```
https://github.com/Sir-Bayard/bayards-hotbar-expansion/releases/latest/download/module.json
```

Foundry's **Update** button then picks up each new release. You can also download `module.zip` from the [latest release](https://github.com/Sir-Bayard/bayards-hotbar-expansion/releases/latest) and unzip it into `Data/modules/bayards-hotbar-expansion`.

Requires Foundry VTT 14 (verified on 14.369). It works with any game system.

## What it does

Foundry keeps 50 hotbar slots per user, on five pages of ten, and shows one page at a time. This module adds a second row that shows another page at the same time.

- **It is the same hotbar.** The second row shows one of your five pages, so a macro on page 2 appears there and nowhere new is stored. Click to run, drop macros, items and actions onto it, drag between slots and between the rows, and right-click to edit or remove, just as on the first row. The hotbar lock applies to both.
- **Its own page.** The arrows beside the second row flip it through pages 1 to 5 without touching the first row. It starts on page 2 and remembers the page you leave it on, for your user on any computer.
- **Its own keys.** Alt+Shift+1 to Alt+Shift+0 run slots 1 to 10 of the second row. Change them in **Configure Controls**. (Alt+1 to 5 are Foundry's keys for switching the first row's page.)
- **Slot count.** Show 1 to 10 slots (setting "Second row: slots shown", kept per browser, since it depends on the screen). The keys follow: with six slots shown, Alt+Shift+7 does nothing.

## Where it sits

- **Foundry's layout:** both rows sit side by side, centred at the bottom of the screen.
- **PF2e HUD's persistent HUD:** the second row sits right after the first, inside the HUD, styled the way the HUD styles the first row.
- **Narrow screens:** the second row stays clear of the sidebar (and, in Foundry's layout, the player list). In Foundry's layout both rows first slide over into free space; if that isn't enough, the second row's slots get smaller, down to about half size. On a very narrow screen, or with PF2e HUD's middle placement on a narrow one, there may not be room for both rows even then; showing fewer slots helps.
- **The floating chat input:** when the sidebar isn't on the Chat tab, Foundry shows a chat input at the bottom right. If the second row reaches under it, the input moves up so both can be used. Turn this off with "Lift the floating chat input".
- When the first row is hidden, so is the second.

## Other modules

The second row is built on Foundry's own hotbar, so modules that react when a hotbar is drawn (the `renderHotbar` hook) see it too. Interface themes use that to style both rows alike.

## Macros

`game.modules.get("bayards-hotbar-expansion").api`:

- `bar`: the second row. `bar.changePage(3)` shows page 3; `bar.page` is the page shown.
- `executeSlot(n)`: runs slot n (1 to 10) of the second row's page.

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
