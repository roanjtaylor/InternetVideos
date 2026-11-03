/**
 * Shorts detection without a server. videos.list with maxWidth set returns
 * player.embedWidth/embedHeight scaled to the real aspect ratio, so a
 * portrait video of three minutes or less is a Short. Verdicts never change,
 * so they are remembered per id.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'shorts-verdicts';
let verdicts: Record<string, boolean> | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<Record<string, boolean>> {
  if (verdicts) return verdicts;
  try {
    verdicts = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    verdicts = {};
  }
  return verdicts!;
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty || !verdicts) return;
    dirty = false;
    AsyncStorage.setItem(KEY, JSON.stringify(verdicts)).catch(() => {});
  }, 2000);
}

export async function knownVerdict(id: string): Promise<boolean | undefined> {
  return (await load())[id];
}

export async function rememberVerdict(id: string, isShort: boolean) {
  (await load())[id] = isShort;
  scheduleFlush();
}

export function judgeShort(v: {
  title?: string;
  duration?: number;
  embedWidth?: number;
  embedHeight?: number;
}): boolean {
  const title = (v.title ?? '').toLowerCase();
  if (title.includes('#shorts') || title.includes('#short ')) return true;
  const d = v.duration ?? 0;
  const portrait = !!v.embedWidth && !!v.embedHeight && v.embedHeight > v.embedWidth;
  if (portrait && d > 0 && d <= 180) return true;
  // Unknown shape and a minute or less: treat as a Short.
  if (!v.embedWidth && d > 0 && d <= 60) return true;
  return false;
}
