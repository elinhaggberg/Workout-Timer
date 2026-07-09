let sentinel = null;

export async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

export async function releaseWakeLock() {
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      /* already released */
    }
    sentinel = null;
  }
}

// Browsers auto-release the lock when the tab is hidden; re-acquire on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && sentinel === null && wantsLock) {
    acquireWakeLock();
  }
});

let wantsLock = false;
export function setWakeLockWanted(wanted) {
  wantsLock = wanted;
  if (wanted) acquireWakeLock();
  else releaseWakeLock();
}
