/**
 * Catching a system's "put it on my hotbar".
 *
 * Systems (PF2e) build a macro from a drop on the hotbar and then call
 * user.assignHotbarMacro(macro, slot) with the slot they were given. The
 * editor passes each drop its own negative slot, which core rejects, and while
 * any are pending user.assignHotbarMacro is wrapped: a call for a pending slot
 * goes to that drop's handler instead; every other call passes through. Each
 * pending slot lapses after a minute (some branches never assign); a call for
 * one that has lapsed, while the wrapper is still in place, is reported instead
 * of reaching core, which would throw.
 *
 * Nothing here touches Foundry directly, so the node tests can drive it with a
 * stand-in user and timers.
 */

/** Catch slots count down from here; core rejects any slot below 1. */
export const FIRST_CATCH_SLOT = -100;
export const LAST_CATCH_SLOT = -100000;
/** How long a drop waits for the system's assign before it lapses. */
export const CATCH_TIMEOUT_MS = 60000;

/**
 * @param {object} options
 * @param {() => object} options.getUser   The user whose assignHotbarMacro is wrapped (the current user).
 * @param {(error?: Error) => void} options.onFailed  A lapsed slot was called, or a handler threw.
 */
export function makeRedirect({ getUser, onFailed, timeoutMs = CATCH_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pending = new Map();
  let nextKey = FIRST_CATCH_SLOT;
  let installed = null;

  function finish(key) {
    const entry = pending.get(key);
    if (!entry) return null;
    clearTimer(entry.timer);
    pending.delete(key);
    if (!pending.size) uninstall();
    return entry;
  }

  function install() {
    if (installed) return;
    const user = getUser();
    const original = user.assignHotbarMacro;
    const wrapper = function (macro, slot, options) {
      const key = Number(slot);
      const entry = finish(key);
      if (!entry) {
        if (key <= FIRST_CATCH_SLOT) {
          onFailed();
          return Promise.resolve();
        }
        return original.call(this, macro, slot, options);
      }
      return Promise.resolve()
        .then(() => entry.handler(macro))
        .catch(error => {
          onFailed(error);
        });
    };
    user.assignHotbarMacro = wrapper;
    installed = { user, wrapper };
  }

  function uninstall() {
    if (!installed) return;
    // Leave it alone if something else has replaced it since.
    if (installed.user.assignHotbarMacro === installed.wrapper) delete installed.user.assignHotbarMacro;
    installed = null;
  }

  return {
    /** Start catching a drop's assign; returns the slot to hand the system. */
    redirect(handler) {
      const key = nextKey--;
      if (nextKey < LAST_CATCH_SLOT) nextKey = FIRST_CATCH_SLOT;
      const timer = setTimer(() => finish(key), timeoutMs);
      pending.set(key, { handler, timer });
      install();
      return key;
    },
    /** Stop catching a slot; returns its entry if it was still pending (so nothing had assigned yet). */
    finish,
    get pendingCount() {
      return pending.size;
    },
    get isInstalled() {
      return !!installed;
    }
  };
}
