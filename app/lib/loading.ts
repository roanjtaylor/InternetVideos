/**
 * A counter of screens currently loading, driving the red bar at the top of
 * the app the way YouTube's does. Any screen can hold it while it fetches.
 */
import { useEffect, useSyncExternalStore } from 'react';

let active = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function beginLoading() {
  active += 1;
  notify();
}

export function endLoading() {
  active = Math.max(0, active - 1);
  notify();
}

export function useIsLoading(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => active > 0,
    () => false,
  );
}

/** Hold the loading bar while `busy` is true. */
export function useLoadingBar(busy: boolean) {
  useEffect(() => {
    if (!busy) return;
    beginLoading();
    return endLoading;
  }, [busy]);
}
