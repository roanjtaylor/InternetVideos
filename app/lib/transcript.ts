/**
 * A video's captions as timestamped plain text, so Gemini can answer from
 * text (seconds) instead of watching the video (minutes). The caption track
 * list comes from the same player endpoint the scrub previews use. Returns
 * null when there are no captions or anything fails: the caller then falls
 * back to Gemini watching the video.
 */

const CLIENTS = [
  { name: 'ANDROID', version: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' },
  { name: 'IOS', version: '20.10.4', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)' },
  { name: 'WEB', version: '2.20250312.04.00', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36' },
];

/** Roughly this much speech per timestamped line. */
const BLOCK_MS = 20_000;
/** ~1M tokens of Gemini context is far more than any transcript; this just guards absurd cases. */
const MAX_CHARS = 600_000;

const cache = new Map<string, Promise<string | null>>();

export function getTranscript(videoId: string): Promise<string | null> {
  let p = cache.get(videoId);
  if (!p) {
    p = load(videoId).catch(() => null);
    cache.set(videoId, p);
    // Never remember a failure: the next question gets another try.
    p.then((t) => {
      if (!t && cache.get(videoId) === p) cache.delete(videoId);
    });
    if (cache.size > 10) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

type Track = { baseUrl: string; languageCode?: string; kind?: string };

function pickTrack(tracks: Track[]): Track | undefined {
  const en = (t: Track) => (t.languageCode ?? '').startsWith('en');
  return (
    tracks.find((t) => en(t) && t.kind !== 'asr') ??
    tracks.find((t) => en(t)) ??
    tracks.find((t) => t.kind !== 'asr') ??
    tracks[0]
  );
}

async function load(videoId: string): Promise<string | null> {
  for (const c of CLIENTS) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify({ videoId, context: { client: { clientName: c.name, clientVersion: c.version, hl: 'en' } } }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const tracks: Track[] = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      const track = pickTrack(tracks.filter((t) => !!t.baseUrl));
      if (!track) continue;
      const cap = await fetch(track.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3', { headers: { 'User-Agent': c.ua } });
      if (!cap.ok) continue;
      const text = format(await cap.json().catch(() => null));
      if (text) return text;
    } catch {
      // try the next client
    }
  }
  return null;
}

export function clock(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** json3 caption events -> "[m:ss] text" lines, one per ~20 s of speech. */
export function format(json: any): string | null {
  const events: any[] = json?.events ?? [];
  const lines: string[] = [];
  let start = -1;
  let buf = '';
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim();
    if (t) lines.push(`[${clock(start / 1000)}] ${t}`);
    buf = '';
  };
  for (const e of events) {
    const text = (e.segs ?? []).map((s: any) => s.utf8 ?? '').join('');
    if (!text.trim()) continue;
    const at = e.tStartMs ?? 0;
    if (start < 0 || at - start >= BLOCK_MS) {
      flush();
      start = at;
    }
    buf += ' ' + text;
  }
  flush();
  const out = lines.join('\n');
  return out ? out.slice(0, MAX_CHARS) : null;
}
