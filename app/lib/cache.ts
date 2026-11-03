/**
 * TTL cache: memory first, AsyncStorage behind it so a relaunch does not
 * re-spend API quota. Values must be JSON-serialisable.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

type Entry<T> = { exp: number; value: T };
const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const PREFIX = 'cache:';

export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit && hit.exp > now) return hit.value;

  if (!hit) {
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (raw) {
        const stored = JSON.parse(raw) as Entry<T>;
        if (stored.exp > now) {
          memory.set(key, stored);
          return stored.value;
        }
      }
    } catch {
      // Storage is a convenience; fall through to the network.
    }
  }

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const value = await fn();
      const entry = { exp: Date.now() + ttlSeconds * 1000, value };
      memory.set(key, entry);
      AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry)).catch(() => {});
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Drop entries whose key starts with keyPrefix (all of them when omitted). */
export async function clearCache(keyPrefix = ''): Promise<void> {
  for (const k of [...memory.keys()]) if (k.startsWith(keyPrefix)) memory.delete(k);
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX + keyPrefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}
