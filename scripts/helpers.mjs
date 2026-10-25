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

/** Preset accent colors for the second row. */
export const ACCENTS = {
  crimson: "#b23a48",
  violet: "#7b5ea7",
  blue: "#3a6ea5",
  green: "#3f8f4f",
  black: "#111111"
};

/** A "#rrggbb" color, or null. Accepts "#rgb" too. */
export function normalizeHex(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

/**
 * The accent color for a choice: a preset, the user's own color ("player"), a
 * custom color ("custom"), or null for none (or anything unusable).
 */
export function accentColor(choice, custom, userColor) {
  if (Object.hasOwn(ACCENTS, String(choice))) return ACCENTS[choice];
  if (choice === "player") return normalizeHex(userColor);
  if (choice === "custom") return normalizeHex(custom) ?? CUSTOM_DEFAULT;
  return null;
}

/** The custom accent color's default, also used when the stored one is unusable. */
export const CUSTOM_DEFAULT = "#c9a227";

/** Black or white text, whichever contrasts more with the background color. */
export function textOn(hex) {
  const h = normalizeHex(hex);
  if (!h) return "#ffffff";
  const lin = c => {
    const s = parseInt(h.slice(c, c + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  // Contrast with black is (l + 0.05) / 0.05, with white 1.05 / (l + 0.05).
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

/** Clamp the wash strength to a whole percent from 10 to 60 (fallback 30). */
export function clampStrength(value, fallback = 30) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(60, Math.max(10, n));
}
