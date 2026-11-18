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
    if (cache.size > 20) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

async function load(videoId: string): Promise<Storyboard | null> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1 like Mac OS X)',
    },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: 'IOS', clientVersion: '19.45.4', hl: 'en' } },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const spec: string | undefined = json?.storyboards?.playerStoryboardSpecRenderer?.spec;
  return spec ? parseSpec(spec) : null;
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
      base.replace('$L', String(pick.i)).replace('$N', pick.name.replace('$M', String(n))) + `&sigh=${pick.sigh}`,
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
