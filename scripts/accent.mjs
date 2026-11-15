/**
 * The second row's accent color: its slots, number badges and page selector,
 * tinted per user, with a live preview in the settings window. The settings
 * window also grays out what doesn't apply (everything while the row is off).
 */

import { accentColor, clampStrength, textOn } from "./helpers.mjs";
import { schedule } from "./layout.mjs";

const MODULE_ID = "bayards-hotbar-expansion";

let getBar = () => null;
/** What the row was last tinted with, so an unchanged accent doesn't refit it. */
let applied = null;

/** Tell this file how to find the second row. */
export function useAccentBar(getter) {
  getBar = getter;
}

/** The user's own color as "#rrggbb" (a Color object in Foundry 14). */
function userColor() {
  const c = game.user?.color;
  return c?.css ?? (c != null ? String(c) : null);
}

/**
 * Tint the second row's slots, number badges and page selector, or clear it.
 * `preview` (from the open settings window) stands in for the stored values.
 */
export function applyAccent(preview = null) {
  const element = getBar()?.element;
  if (!element) return;
  const get = key => (preview && key in preview ? preview[key] : game.settings.get(MODULE_ID, key));
  const color = accentColor(get("accent"), String(get("accentCustom") ?? ""), userColor());
  const wash = `${clampStrength(get("accentStrength"))}%`;
  element.classList.toggle("bhe-accented", !!color);
  if (!color) {
    for (const v of ["--bhe-accent", "--bhe-accent-text", "--bhe-accent-wash"]) element.style.removeProperty(v);
  } else {
    element.style.setProperty("--bhe-accent", color);
    element.style.setProperty("--bhe-accent-text", textOn(color));
    element.style.setProperty("--bhe-accent-wash", wash);
  }
  // The page selector's border can change the row's width.
  const now = color ? `${color}|${wash}` : "";
  if (now !== applied) {
    applied = now;
    schedule();
  }
}

/** Forget the last accent (the row was switched off), so the next one refits. */
export function resetAccent() {
  applied = null;
}

/**
 * In the settings window: show the accent on the row as it is changed, before
 * saving (closing without saving puts the stored one back), and gray out the
 * settings that don't apply.
 */
export function onRenderSettings(app, html) {
  const root = html;
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

/** Read the accent fields from the settings form, preview them and gray out the unused settings. */
function syncSettings(root) {
  const field = key => root.querySelector(`[name="${MODULE_ID}.${key}"]`);
  const gray = (key, off) => field(key)?.closest(".form-group")?.classList.toggle("bhe-setting-off", off);
  const select = field("accent");
  if (!select) return;
  const enabled = field("enabled");
  // With the row off, its other settings do nothing yet.
  const rowOff = !!enabled && !enabled.checked;
  for (const key of ["slots", "liftChat", "accent"]) gray(key, rowOff);
  gray("accentCustom", rowOff || select.value !== "custom");
  gray("accentStrength", rowOff || select.value === "none");
  const custom = field("accentCustom"), strength = field("accentStrength");
  const preview = { accent: select.value };
  if (custom?.value) preview.accentCustom = custom.value;
  if (strength && strength.value !== "" && strength.value != null) preview.accentStrength = strength.value;
  applyAccent(preview);
}
