/**
 * Ask Gemini about the video being watched. YouTube's own in-app Gemini is
 * not open to other apps, but the Gemini API can watch a YouTube video from
 * its link, so the app talks to it directly (no server), with your own key:
 * a free one from https://aistudio.google.com/apikey in app/.env as
 * EXPO_PUBLIC_GEMINI_API_KEY.
 */
export const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const MODEL = 'gemini-2.5-flash';

export type Turn = { role: 'user' | 'model'; text: string };

export const SUGGESTIONS = ['Summarise this video', 'What are the key takeaways?', 'Give me the main points with timestamps'];

export async function askGemini(videoId: string, turns: Turn[]): Promise<string> {
  if (!GEMINI_KEY) throw new Error('NO_KEY');
  // The video rides along with the first question; later turns are text.
  const contents = turns.map((t, i) => ({
    role: t.role,
    parts:
      i === 0
        ? [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: t.text }]
        : [{ text: t.text }],
  }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You answer questions about the attached YouTube video. Be concise and use plain text; cite timestamps like 1:23 when useful.' }],
      },
      contents,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Gemini error ${res.status}`);
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned no answer (the video may be unavailable to it).');
  return text.trim();
}
