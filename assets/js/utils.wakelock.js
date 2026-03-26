(() => {
  let wakeLock = null;
  let requesting = false;
  let enabled = true;

  const mode =
    document.body?.dataset?.wakelockMode ||
    document.documentElement?.dataset?.wakelockMode ||
    "auto";

  if (!("wakeLock" in navigator)) return;

  async function enableWakeLock() {
    if (!enabled) return false;
    if (requesting) return false;
    if (wakeLock && !wakeLock.released) return true;

    requesting = true;
    try {
      wakeLock = await navigator.wakeLock.request("screen");

      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (enabled && document.visibilityState === "visible") {
          enableWakeLock();
        }
      });
    } catch (_) {
      wakeLock = null;
    } finally {
      requesting = false;
    }

    return !!(wakeLock && !wakeLock.released);
  }

  async function disableWakeLock() {
    enabled = false;

    if (!wakeLock || wakeLock.released) {
      wakeLock = null;
      return false;
    }

    try {
      await wakeLock.release();
    } catch (_) {
      // no-op
    } finally {
      wakeLock = null;
    }

    return false;
  }

  async function setEnabled(next) {
    enabled = !!next;
    if (enabled) return enableWakeLock();
    return disableWakeLock();
  }

  document.addEventListener("visibilitychange", () => {
    if (enabled && document.visibilityState === "visible") {
      enableWakeLock();
    }
  });

  window.SiteWakeLock = {
    isSupported: true,
    isEnabled: () => enabled,
    isActive: () => !!(wakeLock && !wakeLock.released),
    enable: () => setEnabled(true),
    disable: () => disableWakeLock(),
    setEnabled,
  };

  if (mode !== "manual") {
    enableWakeLock();
  }
})();
