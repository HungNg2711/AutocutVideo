export interface SubtitleCue {
  text: string
  start: number
  end: number
}

const FONT_PATH = '/app/assets/fonts/Roboto-Variable.ttf'
const FONT_SIZE = 44
const MAX_CHARS_PER_LINE = 24
const MAX_SUBTITLE_LINES = 3
const MERGE_GAP_SECONDS = 0.6
const MAX_MERGED_TEXT_LENGTH = 110
// Real ffmpeg handles far more drawtext nodes than the WASM build without choking, but
// keep a sane ceiling anyway — there's no readability benefit past this many cues/clip.
const MAX_SUBTITLE_CUES_PER_CLIP = 20

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/'/g, '’')
}

function wrapCueText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && candidate.length > MAX_CHARS_PER_LINE) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)

  if (lines.length > MAX_SUBTITLE_LINES) {
    const truncated = lines.slice(0, MAX_SUBTITLE_LINES)
    const last = truncated[MAX_SUBTITLE_LINES - 1]
    truncated[MAX_SUBTITLE_LINES - 1] = `${last.slice(0, Math.max(0, MAX_CHARS_PER_LINE - 1))}…`
    return truncated.join('\n')
  }
  return lines.join('\n')
}

function mergeCloseCues(cues: SubtitleCue[]): SubtitleCue[] {
  if (cues.length === 0) return []
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  const merged: SubtitleCue[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]
    const last = merged[merged.length - 1]
    const gap = cur.start - last.end
    const combined = `${last.text} ${cur.text}`.trim()
    if (gap <= MERGE_GAP_SECONDS && combined.length <= MAX_MERGED_TEXT_LENGTH) {
      last.text = combined
      last.end = Math.max(last.end, cur.end)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

function capCount<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = items.length / max
  const result: T[] = []
  for (let i = 0; i < max; i += 1) result.push(items[Math.floor(i * step)])
  return result
}

/** Same rules as the client's lib/subtitles.ts, ported to run against real ffmpeg. */
export function buildSubtitleFilter(cues: SubtitleCue[], clipStart: number, clipEnd: number): string {
  const relevant = cues
    .map((cue) => ({
      text: cue.text,
      start: Math.max(0, cue.start - clipStart),
      end: Math.min(clipEnd - clipStart, cue.end - clipStart),
    }))
    .filter((cue) => cue.end > cue.start)

  const bounded = capCount(mergeCloseCues(relevant), MAX_SUBTITLE_CUES_PER_CLIP)

  return bounded
    .map(
      (cue) =>
        `drawtext=fontfile=${FONT_PATH}:text='${escapeDrawtext(wrapCueText(cue.text))}':fontsize=${FONT_SIZE}:fontcolor=white:` +
        `borderw=3:bordercolor=black@0.9:box=1:boxcolor=black@0.35:boxborderw=14:` +
        `x=(w-text_w)/2:y=h-th-130:line_spacing=6:` +
        `enable='between(t,${cue.start.toFixed(2)},${cue.end.toFixed(2)})'`,
    )
    .join(',')
}
