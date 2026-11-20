/**
 * Ask Gemini about the video being watched. YouTube's own in-app Gemini is
 * not open to other apps, but the Gemini API can watch a YouTube video from
 * its link, so the app talks to it directly (no server), with your own key:
 * a free one from https://aistudio.google.com/apikey in app/.env as
 * EXPO_PUBLIC_GEMINI_API_KEY.
 *
 * Watching video is slow (minutes), reading a transcript is fast (seconds).
 * So each question goes to the transcript first; only if Gemini says the
 * transcript cannot answer it (something shown on screen, no captions, ...)
 * does it then watch the video.
 */
import { getTranscript } from '@/lib/transcript';

export const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
/**
 * Models to try, in order. Each has its own free quota, and any of them can be
 * overloaded at a given moment, so a slow or refused one is skipped, not waited on.
 * Transcript: the lite models answer from text in about a second.
 * Video: the stronger models see more, the lite one is the quick fallback.
 */
const TRANSCRIPT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.5-flash'];
const VIDEO_MODELS = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
/** Give up on a model that has not answered in this long and try the next. */
const TRANSCRIPT_TIMEOUT_MS = 12_000;
const VIDEO_TIMEOUT_MS = 90_000;
/** A model that refused (quota used up, overloaded) or timed out is skipped for this long. */
const SKIP_MS = 10 * 60_000;
const skipped = new Map<string, { until: number; quota: boolean }>();

/** note: shown under an answer, never sent to Gemini (e.g. which model answered once a free quota ran out). */
export type Turn = { role: 'user' | 'model'; text: string; note?: string };
export type Answer = { text: string; note?: string };
export type Stage = 'transcript' | 'video';

export const SUGGESTIONS = ['Summarise this video', 'What are the key takeaways?', 'Give me the main points with timestamps'];

const NEED_VIDEO = 'NEED_VIDEO';

const VIDEO_SYSTEM =
  'You answer questions about the attached YouTube video. Be concise and use plain text; cite timestamps like 1:23 when useful.';
const TRANSCRIPT_SYSTEM =
  'You answer questions about a YouTube video using only its timestamped transcript, given in the first message as lines like "[1:23] text". ' +
  'Be concise and use plain text; cite timestamps like 1:23 when useful. ' +
  `If the question cannot be answered from the transcript alone (for example it asks about something shown on screen such as a slide, chart, code, a person's appearance or an action with no narration, or the transcript simply lacks the information), reply with exactly ${NEED_VIDEO} and nothing else. ` +
  'Never guess about visuals.';

export async function askGemini(videoId: string, turns: Turn[], onStage?: (s: Stage) => void): Promise<Answer> {
  if (!GEMINI_KEY) throw new Error('NO_KEY');

  onStage?.('transcript');
  const transcript = await getTranscript(videoId);
  if (transcript) {
    const contents = turns.map((t, i) => ({
      role: t.role,
      parts: [{ text: i === 0 ? `Transcript:\n${transcript}\n\nQuestion: ${t.text}` : t.text }],
    }));
    const answer = await generate(TRANSCRIPT_SYSTEM, contents);
    if (answer.text && !answer.text.includes(NEED_VIDEO)) return answer;
  }

  // No captions, or the question is about what is on screen: watch the video.
  onStage?.('video');
  // The video rides along with the first question; later turns are text.
  const contents = turns.map((t, i) => ({
    role: t.role,
    parts:
      i === 0
        ? [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: t.text }]
        : [{ text: t.text }],
  }));
  const answer = await generate(VIDEO_SYSTEM, contents, true);
  if (!answer.text) throw new Error('Gemini returned no answer (the video may be unavailable to it).');
  return answer;
}

/** "Please retry in 21h53m43.5s" in a quota error -> milliseconds, or 0 when absent. */
function retryMs(message: string): number {
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message);
  if (!m) return 0;
  return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000;
}

function duration(ms: number): string {
  const min = Math.max(Math.ceil(ms / 60_000), 1);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/**
 * One answer from the first model that gives one. A model that is out of quota
 * (429), overloaded (5xx), gone (404) or silent past the timeout is set aside
 * for a while and the next one is tried straight away: waiting on a busy model
 * can take minutes, another model usually answers in a second.
 *
 * Running out of free quota is never silent: an answer from a fallback model
 * carries a note saying so, and when no model is left the error says when the
 * quota comes back.
 */
async function generate(system: string, contents: unknown[], video = false): Promise<Answer> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    // Video: ~100 tokens/sec instead of ~300, much faster and plenty for Q&A and summaries.
    ...(video ? { generationConfig: { mediaResolution: 'MEDIA_RESOLUTION_LOW' } } : {}),
  });
  const all = video ? VIDEO_MODELS : TRANSCRIPT_MODELS;
  const now = Date.now();
  const fresh = all.filter((m) => (skipped.get(m)?.until ?? 0) <= now);
  // Everything set aside: try them all again rather than fail without asking.
  const models = fresh.length ? fresh : all;
  const timeout = video ? VIDEO_TIMEOUT_MS : TRANSCRIPT_TIMEOUT_MS;
  let lastError = 'Gemini is unavailable right now.';
  for (const model of models) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    let status = 0;
    let json: any = {};
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body,
        signal: ctl.signal,
      });
      status = res.status;
      json = await res.json().catch(() => ({}));
    } catch (e: any) {
      // Timed out or the network dropped: status stays 0 and the next model is tried.
      lastError = ctl.signal.aborted ? 'Gemini took too long to answer.' : (e?.message ?? String(e));
    } finally {
      clearTimeout(timer);
    }
    if (status >= 200 && status < 300) {
      const text = (json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '').trim();
      // Preferred models that are out of free quota right now, so this one answered instead.
      const t = Date.now();
      const out = all.slice(0, all.indexOf(model)).filter((m) => {
        const k = skipped.get(m);
        return !!k && k.quota && k.until > t;
      });
      return out.length ? { text, note: `Free quota used up for ${out.join(', ')}. Answered by ${model}.` } : { text };
    }
    if (status) {
      lastError = json?.error?.message ?? `Gemini error ${status}`;
      // Anything else (bad key, bad request) would fail the same way on every model.
      if (status !== 429 && status !== 404 && status < 500) throw new Error(lastError);
    }
    // Out of quota: stay away until Google says it is back (a daily quota can be most of a day).
    const quota = status === 429;
    skipped.set(model, { until: Date.now() + (quota ? Math.max(retryMs(lastError), 60_000) : SKIP_MS), quota });
  }

  // Nothing answered. Say so plainly when the free quota is why.
  const t = Date.now();
  const out = all.map((m) => skipped.get(m)).filter((k) => !!k && k.quota && k.until > t) as { until: number }[];
  if (out.length === all.length) {
    const back = Math.min(...out.map((k) => k.until)) - t;
    throw new Error(
      `Free Gemini quota used up on every model. Try again in about ${duration(back)}, or turn on billing for your key at aistudio.google.com.`,
    );
  }
  if (out.length) {
    throw new Error(`Free Gemini quota is used up on ${out.length} of ${all.length} models and the rest are not answering: ${lastError}`);
  }
  throw new Error(lastError);
}
