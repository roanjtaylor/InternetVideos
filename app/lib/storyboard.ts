/**
 * Scrub previews: YouTube cuts every video into sprite sheets of small frames
 * (its "storyboards"). The Data API does not expose them, so the spec comes
 * from the same player endpoint YouTube's own apps use. If that fails, the
 * scrub bar simply shows no preview.
 */

export type Storyboard = {
  /** Frame size in points. */
  w: number;
  h: number;
  cols: number;
  rows: number;
  count: number;
  /** Milliseconds between frames; 0 when the frames are spread evenly over the video. */
  intervalMs: number;
  /** URL of sheet n. */
  sheet: (n: number) => string;
};

const cache = new Map<string, Promise<Storyboard | null>>();

export function storyboard(videoId: string): Promise<Storyboard | null> {
  let p = cache.get(videoId);
  if (!p) {
    p = load(videoId).catch(() => null);
    cache.set(videoId, p);
    // Never remember a failure: the next scrub gets another try.
    p.then((b) => {
      if (!b && cache.get(videoId) === p) cache.delete(videoId);
    });
    if (cache.size > 20) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

const CLIENTS = [
  { name: 'IOS', version: '20.10.4', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)' },
  { name: 'ANDROID', version: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' },
  { name: 'MWEB', version: '2.20250312.04.00', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1' },
  { name: 'WEB', version: '2.20250312.04.00', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36' },
];

async function load(videoId: string): Promise<Storyboard | null> {
  for (const c of CLIENTS) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify({
          videoId,
          context: { client: { clientName: c.name, clientVersion: c.version, hl: 'en' } },
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const r = json?.storyboards?.playerStoryboardSpecRenderer ?? json?.storyboards?.playerLiveStoryboardSpecRenderer;
      const sb = r?.spec ? parseSpec(r.spec) : null;
      if (sb) return sb;
    } catch {
      // try the next client
    }
  }
  return null;
}

/** "base|w#h#count#cols#rows#interval#name#sigh|…": one level per part after the base URL, smallest first. */
export function parseSpec(spec: string): Storyboard | null {
  const [base, ...levels] = spec.split('|');
  const parsed = levels
    .map((l, i) => {
      const [w, h, count, cols, rows, interval, name, sigh] = l.split('#');
      return { i, w: +w, h: +h, count: +count, cols: +cols, rows: +rows, intervalMs: +interval, name, sigh };
    })
    .filter((l) => l.w > 0 && l.h > 0 && l.cols > 0 && l.rows > 0 && l.count > 0);
  if (!parsed.length) return null;
  // The largest level up to 320 wide: sharp enough for a bubble, small to download.
  const pick = [...parsed].reverse().find((l) => l.w <= 320) ?? parsed[0];
  return {
    w: pick.w,
    h: pick.h,
    cols: pick.cols,
    rows: pick.rows,
    count: pick.count,
    intervalMs: pick.intervalMs,
    sheet: (n) =>
      base.replace('$L', String(pick.i)).replace('$N', () => pick.name.replace('$M', String(n))) + (pick.sigh ? `&sigh=${encodeURIComponent(pick.sigh)}` : ''),
  };
}

/** Which frame shows `seconds` into a video of `duration` seconds: its sheet, column and row. */
export function frameAt(sb: Storyboard, seconds: number, duration: number) {
  const raw = sb.intervalMs > 0 ? (seconds * 1000) / sb.intervalMs : (seconds / Math.max(1, duration)) * sb.count;
  const index = Math.max(0, Math.min(sb.count - 1, Math.floor(raw)));
  const per = sb.cols * sb.rows;
  const within = index % per;
  return { sheet: Math.floor(index / per), col: within % sb.cols, row: Math.floor(within / sb.cols) };
}
