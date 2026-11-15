/**
 * Where the second row sits and how big it is: put after core's #hotbar,
 * fitted on screen, with the right-hand column lifted clear of it. The row is
 * read through the getter main.mjs hands to useBar().
 *
 * Measuring is the expensive part, and other modules' windows render many
 * times a second in play (PF2e HUD on every hover and selection), so a pass
 * that finds the screen as the last pass left it stops before measuring.
 */

import { chatLift, fitSlotSize, gridStartAfter } from "./helpers.mjs";

const MODULE_ID = "bayards-hotbar-expansion";
export const DOCK_ID = "bhe-dock";
/** Foundry's right-hand column: the floating chat input, and docked panels such as PF2e HUD's tracker. */
export const RIGHT_COLUMN = "ui-right-column-1";
/** Room kept between the row and whatever it must stay clear of, in screen pixels. */
const EDGE_GAP = 8;
/** Fitting measures again this many times at most (a centered panel moves as it narrows). */
const FIT_PASSES = 6;

let getBar = () => null;

/** Tell this file how to find the second row. */
export function useBar(getter) {
  getBar = getter;
}

/* -------------------------------------------- */
/*  Placement                                   */
/* -------------------------------------------- */

/**
 * Put the second row right after core's #hotbar, wherever that is now, and
 * say whether anything had to change.
 * - In core's layout #hotbar sits in #ui-bottom, which stacks its children in a
 *   column, so both rows go into a small row container there.
 * - When another module has taken #hotbar into its own panel (PF2e HUD's
 *   persistent HUD does, and rebuilds that panel's contents on every render),
 *   the second row follows it as a sibling, and in a grid it takes the next
 *   column on the hotbar's grid row.
 */
export function place(element = getBar()?.element) {
  const hotbar = document.getElementById("hotbar");
  if (!element || !hotbar || element === hotbar) return false;
  const uiBottom = document.getElementById("ui-bottom");
  let dock = document.getElementById(DOCK_ID);
  const parent = hotbar.parentElement;
  let changed = false;

  if (parent === uiBottom || (dock && parent === dock)) {
    if (!dock) {
      dock = document.createElement("div");
      dock.id = DOCK_ID;
    }
    if (parent !== dock) {
      hotbar.before(dock);
      dock.append(hotbar);
      changed = true;
    }
    if (element.previousElementSibling !== hotbar) {
      hotbar.after(element);
      changed = true;
    }
    if (clearGrid(element)) changed = true;
    // Sit on the same line as the first row, whatever bottom margin it has been given.
    const margin = getComputedStyle(hotbar).marginBottom;
    if (element.style.marginBottom !== margin) {
      element.style.marginBottom = margin;
      changed = true;
    }
    return changed;
  }
  if (element.style.marginBottom) {
    element.style.removeProperty("margin-bottom");
    changed = true;
  }

  if (element.previousElementSibling !== hotbar) {
    hotbar.after(element);
    changed = true;
  }
  if (dock && !dock.children.length) {
    dock.remove();
    changed = true;
  }

  const style = getComputedStyle(parent);
  if (style.display === "grid" || style.display === "inline-grid") {
    const hb = getComputedStyle(hotbar);
    if (!element.classList.contains("bhe-in-grid")) {
      element.classList.add("bhe-in-grid");
      changed = true;
    }
    const want = {
      gridRowStart: hb.gridRowStart,
      gridRowEnd: hb.gridRowEnd,
      gridColumnStart: gridStartAfter(hb.gridColumnEnd),
      gridColumnEnd: "span 1"
    };
    for (const [p, v] of Object.entries(want)) {
      if (element.style[p] === v) continue;
      element.style[p] = v;
      changed = true;
    }
  } else if (clearGrid(element)) changed = true;
  return changed;
}

/** Take the row out of a grid placement; true if it was in one. */
function clearGrid(element) {
  if (!element.classList.contains("bhe-in-grid")) return false;
  element.classList.remove("bhe-in-grid");
  for (const p of ["gridRowStart", "gridRowEnd", "gridColumnStart", "gridColumnEnd"]) element.style[p] = "";
  return true;
}

/* -------------------------------------------- */
/*  Fitting                                     */
/* -------------------------------------------- */

/**
 * Keep the row on screen. It must stop before the sidebar, and in core's layout
 * (both rows centered together) also clear the player list and scene controls.
 * Positions are read in screen pixels; sizes are written in layout pixels.
 */
function fit(element) {
  const dock = element.parentElement?.id === DOCK_ID ? element.parentElement : null;
  element.style.removeProperty("--bhe-fit-size");
  if (dock) dock.style.removeProperty("translate");
  if (element.classList.contains("bhe-hidden")) return;
  const slot = element.querySelector(".slot");
  if (!slot) return;
  const scale = slot.offsetWidth ? slot.getBoundingClientRect().width / slot.offsetWidth : 1;
  const right = rightLimit(element);
  if (dock) fitDock(element, dock, right, scale);
  else fitPanel(element, right, scale);
}

/** The screen x the row's right edge must stay left of. */
function rightLimit(element) {
  const iface = document.getElementById("interface")?.getBoundingClientRect();
  const sidebar = document.getElementById("sidebar");
  let right = (sidebar?.getClientRects().length ? sidebar.getBoundingClientRect().left : (iface?.right ?? window.innerWidth)) - EDGE_GAP;
  // With lifting off, panels in the right-hand column that come down into the
  // row's band (PF2e HUD's combat tracker, say) are an edge too. The chat input
  // never is: it only floats there when the sidebar isn't on Chat.
  const band = game.settings.get(MODULE_ID, "liftChat") ? null : contentRect(element);
  if (band) {
    for (const part of document.querySelectorAll(`#${RIGHT_COLUMN} > *`)) {
      if (part.id === "chat-notifications" || !part.getClientRects().length) continue;
      const r = part.getBoundingClientRect();
      if (r.width > 1 && r.height > 1 && r.bottom > band.top && r.top < band.bottom) right = Math.min(right, r.left - EDGE_GAP);
    }
  }
  return right;
}

const slotWidth = element => element.querySelector(".slot")?.getBoundingClientRect().width ?? 0;

/** Slots on one line (core's narrow layout stacks them five by two). */
function perLine(element) {
  const slots = [...element.querySelectorAll(".slot")];
  const top = slots[0].getBoundingClientRect().top;
  return slots.filter(s => Math.abs(s.getBoundingClientRect().top - top) < 2).length;
}

/** In another module's panel: shrink the slots, measuring again as the panel moves. */
function fitPanel(element, right, scale) {
  // The row's own box is width-contained there, so measure its contents.
  const rowRight = () => contentRect(element)?.right ?? 0;
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const size = fitSlotSize(slotWidth(element), perLine(element), rowRight() - right, scale);
    if (!size) return;
    element.style.setProperty("--bhe-fit-size", `${size}px`);
  }
}

/**
 * In core's layout: both rows first slide over into free space, between the
 * player list and scene controls on the left and the right limit; the slots
 * shrink only when that isn't enough.
 */
function fitDock(element, dock, right, scale) {
  const hotbar = document.getElementById("hotbar");
  const iface = document.getElementById("interface")?.getBoundingClientRect();
  let left = (iface?.left ?? 0) + EDGE_GAP;
  const d = dock.getBoundingClientRect();
  // The player list's inner boxes can spill past it, so look at its children too.
  for (const id of ["players", "scene-controls"]) {
    const e = document.getElementById(id);
    if (!e?.getClientRects().length) continue;
    for (const part of [e, ...e.children]) {
      const r = part.getBoundingClientRect();
      if (r.width && r.bottom > d.top && r.top < d.bottom) left = Math.max(left, r.right + EDGE_GAP);
    }
  }
  const span = () => [hotbar.getBoundingClientRect().left, contentRect(element)?.right ?? 0];
  let [first, last] = span();
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const size = fitSlotSize(slotWidth(element), perLine(element), (last - first) - (right - left), scale);
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
/*  The right-hand column                       */
/* -------------------------------------------- */

/**
 * Foundry's right-hand column holds the floating chat input (when the sidebar
 * isn't on the Chat tab) and docked panels such as PF2e HUD's combat tracker.
 * If the second row reaches under any of them, lift the whole column so its
 * bottom clears the row.
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
  const element = getBar()?.element;
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

/** Put back everything the row moved: the dock and the column lift. */
export function clearLayout() {
  lastKey = null;
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

/* -------------------------------------------- */
/*  Keeping up                                  */
/* -------------------------------------------- */

let pending = null;
let forced = false;
/** What the screen looked like when the last pass finished. */
let lastKey = null;

/**
 * Re-place and fit the row, and lift the right-hand column, once the page has
 * settled. Without `force` the pass stops early when nothing it reads has
 * changed since the last one; the row's own renders force it.
 */
export function schedule(force = false) {
  if (force) forced = true;
  if (pending) return;
  pending = setTimeout(runPass, 0);
}

/** Schedule, then again once the sidebar's slide has finished. */
export function scheduleSettled() {
  schedule();
  setTimeout(() => schedule(), 400);
}

function runPass() {
  pending = null;
  const force = forced;
  forced = false;
  const bar = getBar();
  const element = bar?.element;
  if (!element) return;
  const moved = place(element);
  const wasShown = !element.classList.contains("bhe-hidden");
  const shown = matchVisibility(element);
  if (!force && !moved && shown === wasShown && lastKey !== null && layoutKey(element) === lastKey) return;
  if (shown) {
    // Core's width classes stack the row five by two, which a panel row can't take.
    if (element.classList.contains("bhe-in-grid")) element.classList.remove("lg", "md", "sm", "min");
    else bar._onResize();
  }
  // Fit against the column as it sits unlifted (with lifting off its panels
  // are edges), then lift it clear of the row's final size.
  liftChat(true);
  fit(element);
  liftChat();
  lastKey = layoutKey(element);
}

/**
 * Everything a pass reads, as one string: the window, the setting, and the
 * boxes of core's row, this row, the sidebar, the player list, the scene
 * controls and the right-hand column with its panels. Read after a pass, it is
 * what the next pass compares against.
 */
function layoutKey(element) {
  const box = e => {
    if (!e?.getClientRects().length) return "-";
    const r = e.getBoundingClientRect();
    return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
  };
  const kids = id => [...(document.getElementById(id)?.children ?? [])].map(e => (e.id === "chat-notifications" ? cards(e) : box(e))).join(";");
  // Chat cards make the notification area grow and shrink all through play;
  // only its sides, its bottom and whether it shows at all matter here.
  const cards = e => {
    if (!e.getClientRects().length) return "-";
    const r = e.getBoundingClientRect();
    return `${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.bottom)},${r.width > 1 && r.height > 1}`;
  };
  return [
    window.innerWidth, window.innerHeight, game.settings.get(MODULE_ID, "liftChat"),
    box(document.getElementById("hotbar")), box(element), [...element.children].map(box).join(";"),
    box(document.getElementById("sidebar")),
    box(document.getElementById("players")), kids("players"),
    box(document.getElementById("scene-controls")), kids("scene-controls"),
    box(document.getElementById(RIGHT_COLUMN)), kids(RIGHT_COLUMN)
  ].join("|");
}

/* -------------------------------------------- */
/*  Watching for changes no app announces       */
/* -------------------------------------------- */

let resizes = null;
let additions = null;

/**
 * Refit when core's row, the sidebar, the player list, the scene controls or
 * the right-hand column and its panels change size, which can happen without
 * any window rendering (a panel growing, the sidebar sliding).
 */
export function observeLayout() {
  if (resizes) return;
  resizes = new ResizeObserver(() => schedule());
  for (const id of ["hotbar", "sidebar", "players", "scene-controls"]) {
    const e = document.getElementById(id);
    if (e) resizes.observe(e);
  }
  const column = document.getElementById(RIGHT_COLUMN);
  if (!column) return;
  resizes.observe(column);
  // Not the chat notifications: they change size with every chat card.
  const watch = node => node instanceof HTMLElement && node.id !== "chat-notifications";
  for (const child of column.children) if (watch(child)) resizes.observe(child);
  // Panels come and go in the column (PF2e HUD's tracker when a combat starts).
  additions = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (watch(node)) resizes.observe(node);
      for (const node of record.removedNodes) if (node instanceof HTMLElement) resizes.unobserve(node);
    }
    schedule();
  });
  additions.observe(column, { childList: true });
}

export function unobserveLayout() {
  resizes?.disconnect();
  additions?.disconnect();
  resizes = additions = null;
}
