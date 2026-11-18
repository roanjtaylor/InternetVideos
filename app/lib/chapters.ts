export type Chapter = { start: number; title: string };

const LINE = /^\s*[-–—•*]?\s*(?:\[|\()?(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)(?:\]|\))?\s*[-–—:|.]*\s*(.+?)\s*$/;

/**
 * Chapters from a description, by YouTube's rules: timestamped lines, the
 * first at 0:00, at least three, each at least ten seconds long. Otherwise none.
 */
export function parseChapters(description: string | undefined, duration: number): Chapter[] {
  if (!description) return [];
  const found: Chapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const start = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const prev = found[found.length - 1];
    if (prev && start <= prev.start) continue;
    found.push({ start, title: m[4] });
  }
  if (found.length < 3 || found[0].start !== 0) return [];
  if (duration > 0 && found.some((c) => c.start >= duration)) return [];
  for (let i = 0; i < found.length - 1; i++) if (found[i + 1].start - found[i].start < 10) return [];
  return found;
}

/** The chapter playing at `time`. */
export function chapterAt(chapters: Chapter[], time: number): number {
  let idx = 0;
  for (let i = 0; i < chapters.length; i++) if (chapters[i].start <= time) idx = i;
  return idx;
}
