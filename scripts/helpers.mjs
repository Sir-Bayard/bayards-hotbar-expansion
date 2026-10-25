/**
 * Pure helpers for Bayard's Hotbar Expansion. Nothing here touches Foundry,
 * so the node tests can load this file on its own.
 */

/** Slots on one hotbar page, and the number of pages core keeps. */
export const PAGE_SIZE = 10;
export const PAGE_COUNT = 5;

/** Clamp a stored page to a whole number from 1 to 5 (fallback 2). */
export function clampPage(value, fallback = 2) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > PAGE_COUNT) return fallback;
  return n;
}

/** Clamp a stored slot count to a whole number from 1 to 10 (fallback 10). */
export function clampSlots(value, fallback = PAGE_SIZE) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(PAGE_SIZE, Math.max(1, n));
}

/**
 * The user's hotbar slot number (1 to 50) for position n (1 to 10) on a page.
 * Returns null when n is outside the shown slots.
 */
export function slotFor(page, n, shown = PAGE_SIZE) {
  if (!Number.isInteger(n) || n < 1 || n > Math.min(shown, PAGE_SIZE)) return null;
  return (clampPage(page, 1) - 1) * PAGE_SIZE + n;
}

/**
 * Where the second row starts in a CSS grid, given the hotbar's computed
 * grid-column-end. A line number stays a number; a named area ("full") becomes
 * its end line ("full-end"); a line name is used as it is. Anything else (auto,
 * a span) falls back to -1, the last explicit line.
 */
export function gridStartAfter(columnEnd) {
  const v = String(columnEnd ?? "").trim();
  if (/^-?\d+$/.test(v)) return v;
  if (!v || v === "auto" || v.startsWith("span")) return "-1";
  if (/-(end|start)$/.test(v)) return v;
  if (/^[A-Za-z_][\w-]*$/.test(v)) return `${v}-end`;
  return "-1";
}

/**
 * How far to lift the floating chat column so its bottom clears the second row.
 * Rects are {left, right, top, bottom} in screen pixels; chatRect is where the
 * column sits unlifted. Returns 0 when they don't share any horizontal space.
 */
export function chatLift(barRect, chatRect, gap = 6) {
  if (!barRect || !chatRect) return 0;
  if (barRect.right <= barRect.left || barRect.bottom <= barRect.top) return 0;
  const sideBySide = barRect.right <= chatRect.left || barRect.left >= chatRect.right;
  if (sideBySide) return 0;
  const lift = chatRect.bottom - barRect.top + gap;
  return lift > 0 ? Math.ceil(lift) : 0;
}

/** The smallest a slot is shrunk to when the row has to fit a narrow space. */
export const MIN_SLOT = 32;

/**
 * The slot size (layout px) that removes `over` screen px of overflow from a row
 * of `count` slots, each `size` screen px wide, where `scale` is screen px per
 * layout px (the interface scale). Returns null when nothing needs to change.
 */
export function fitSlotSize(size, count, over, scale = 1, min = MIN_SLOT) {
  if (!(over > 0) || !(count > 0) || !(size > 0) || !(scale > 0)) return null;
  const natural = size / scale;
  const next = Math.max(min, Math.floor((size - over / count) / scale));
  return next < natural ? next : null;
}
