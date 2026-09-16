import { pipeline } from '@huggingface/transformers'
import type { SubtitleCue } from '../types'

const WHISPER_MODEL = 'Xenova/whisper-tiny'
const FONT_URL = '/fonts/Roboto-Variable.ttf'
const FONT_FS_NAME = 'subtitle-font.ttf'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<any>

let transcriberPromise: Promise<Transcriber> | null = null
let fontBytesPromise: Promise<Uint8Array> | null = null

/** Lazily loads Whisper (tiny, multilingual) via transformers.js — runs fully client-side. */
function getTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    // fp32 avoids a DequantizeLinear incompatibility with the default quantized
    // weights on some onnxruntime-web builds; whisper-tiny is small enough that
    // the extra download size doesn't matter much.
    transcriberPromise = pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      dtype: 'fp32',
    }) as unknown as Promise<Transcriber>
  }
  return transcriberPromise
}

/**
 * Returns a fresh copy of the font bytes every call. The underlying fetch is cached (no
 * repeat network request), but ffmpeg.writeFile() transfers — and thereby detaches — the
 * ArrayBuffer it's given, so handing out the same cached buffer twice would make the
 * second write crash with "ArrayBuffer is detached" the moment a second clip is cut in
 * the same session.
 */
export async function getSubtitleFontBytes(): Promise<Uint8Array> {
  if (!fontBytesPromise) {
    fontBytesPromise = fetch(FONT_URL)
      .then((res) => res.arrayBuffer())
      .then((buf) => new Uint8Array(buf))
  }
  const cached = await fontBytesPromise
  return cached.slice()
}

export const SUBTITLE_FONT_FS_NAME = FONT_FS_NAME

/** Decodes WAV bytes to a mono Float32Array, resampled to 16kHz for Whisper. */
export async function decodeWavToFloat32(bytes: Uint8Array): Promise<Float32Array> {
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new AudioContextCtor({ sampleRate: 16000 })
  try {
    const arrayBuffer = bytes.slice().buffer as ArrayBuffer
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    return audioBuffer.getChannelData(0).slice()
  } finally {
    await audioCtx.close()
  }
}

const WHISPER_SAMPLE_RATE = 16000
const TRANSCRIBE_CHUNK_SECONDS = 20

interface TranscribeOptions {
  /** Called after each chunk finishes, with overall fraction (0-1) done. */
  onProgress?: (fraction: number) => void
  /** Checked before each chunk; return false to stop early (e.g. user cancelled). */
  shouldContinue?: () => boolean
}

/**
 * Transcribes audio in ~20s windows (well under Whisper's 30s limit) instead of handing the
 * whole file to the pipeline at once. This keeps memory bounded for long recordings, and lets
 * the caller show real progress and cooperatively cancel between chunks.
 */
export async function transcribeAudio(audio: Float32Array, options: TranscribeOptions = {}): Promise<SubtitleCue[]> {
  const transcriber = await getTranscriber()
  const chunkSamples = TRANSCRIBE_CHUNK_SECONDS * WHISPER_SAMPLE_RATE
  const totalChunks = Math.max(1, Math.ceil(audio.length / chunkSamples))
  const cues: SubtitleCue[] = []

  for (let i = 0; i < totalChunks; i += 1) {
    if (options.shouldContinue && !options.shouldContinue()) {
      throw new Error('cancelled')
    }

    const startSample = i * chunkSamples
    const slice = audio.subarray(startSample, Math.min(audio.length, startSample + chunkSamples))
    const offsetSeconds = startSample / WHISPER_SAMPLE_RATE

    const result = await transcriber(slice, { return_timestamps: true })
    const rawChunks: Array<{ text?: string; timestamp?: [number, number | null] }> = Array.isArray(result?.chunks)
      ? result.chunks
      : [{ text: result?.text, timestamp: [0, slice.length / WHISPER_SAMPLE_RATE] }]

    for (const chunk of rawChunks) {
      const text = (chunk.text ?? '').trim()
      const start = chunk.timestamp?.[0]
      if (!text || typeof start !== 'number') continue
      const end = typeof chunk.timestamp?.[1] === 'number' ? chunk.timestamp[1]! : start + 2
      cues.push({ text, start: offsetSeconds + start, end: offsetSeconds + end })
    }

    options.onProgress?.((i + 1) / totalChunks)
  }

  return cues
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%') // otherwise drawtext tries to expand it as a %{...} function
    .replace(/'/g, '’') // sidestep quote-escaping inside the filter's single-quoted value
}

// Chaining one drawtext filter per Whisper cue was the actual cause of the "hangs while
// cutting" bug: a clip with many short cues (dense speech, several 20s transcription
// chunks) could produce 30-40+ chained drawtext nodes, and ffmpeg's filter graph — each
// node loading its own copy of the font and alpha-blending a text box every frame —
// became slow enough to look frozen. Merging adjacent cues and capping the total count
// keeps the filter graph small regardless of how many raw cues Whisper returns.
const MERGE_GAP_SECONDS = 0.35
const MAX_MERGED_TEXT_LENGTH = 90
const MAX_SUBTITLE_CUES_PER_CLIP = 14

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

/** Evenly samples down to `max` entries instead of just truncating the tail. */
function capCount<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = items.length / max
  const result: T[] = []
  for (let i = 0; i < max; i += 1) result.push(items[Math.floor(i * step)])
  return result
}

/**
 * Builds a chained drawtext filter (one node per merged cue, time-gated with `enable`)
 * for the cues that fall inside [clipStart, clipEnd), timed relative to the clip.
 */
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
        `drawtext=fontfile=${FONT_FS_NAME}:text='${escapeDrawtext(cue.text)}':fontsize=52:fontcolor=white:` +
        `borderw=3:bordercolor=black@0.9:box=1:boxcolor=black@0.35:boxborderw=14:` +
        `x=(w-text_w)/2:y=h-th-130:line_spacing=6:` +
        `enable='between(t,${cue.start.toFixed(2)},${cue.end.toFixed(2)})'`,
    )
    .join(',')
}
