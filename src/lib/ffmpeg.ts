import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'
// Explicit worker URL avoids Vite dev-server issues resolving ffmpeg's internal
// `new Worker(new URL('./worker.js', import.meta.url))` during dep pre-bundling.
import ffmpegWorkerURL from '@ffmpeg/ffmpeg/worker?url'

const CORE_VERSION = '0.12.6'
// FFmpeg's worker always runs as a module worker, so it loads the core via
// dynamic import() — that requires the ESM build, not the UMD one.
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

/** Lazily loads the single-threaded ffmpeg.wasm core (runs in a worker, no COOP/COEP headers needed). */
export async function getFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      if (onLog) {
        ffmpeg.on('log', ({ message }) => onLog(message))
      }
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
        classWorkerURL: ffmpegWorkerURL,
      })
      ffmpegInstance = ffmpeg
      return ffmpeg
    })()
  }
  return loadPromise
}

/** Kills the worker and drops the singleton so the next getFFmpeg() starts fresh — used to cancel a running job. */
export async function terminateFFmpeg(): Promise<void> {
  ffmpegInstance?.terminate()
  ffmpegInstance = null
  loadPromise = null
}

export async function writeInputFile(ffmpeg: FFmpeg, file: File, name: string) {
  await ffmpeg.writeFile(name, await fetchFile(file))
}

/**
 * Extracts the input's audio track as 16kHz mono WAV — the format Whisper expects.
 * Pass `startSeconds`/`endSeconds` to only extract the range that will actually be
 * captioned, instead of decoding audio for the whole source file.
 */
export async function extractAudioWav(
  ffmpeg: FFmpeg,
  inputName: string,
  startSeconds?: number,
  endSeconds?: number,
  onProgress?: (timeSeconds: number) => void,
): Promise<Uint8Array> {
  const outName = 'audio-16k-mono.wav'
  const args: string[] = []
  if (startSeconds != null) args.push('-ss', String(startSeconds))
  if (endSeconds != null) args.push('-to', String(endSeconds))
  args.push('-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', outName)
  // Callers only call this once they know the source has an audio stream, so a failure
  // here is a real problem — surface it instead of silently reading a file that was
  // never written (that used to throw a confusing "FS error" from readFile).
  await runTracked(ffmpeg, args, { onProgress, checkExitCode: true })
  const data = await ffmpeg.readFile(outName)
  await ffmpeg.deleteFile(outName)
  return data as Uint8Array
}

/**
 * Runs an ffmpeg command while optionally collecting stderr log lines and/or
 * reporting live time-based progress (so long operations don't look frozen).
 *
 * `timeoutMs` is a safety net — ffmpeg-core aborts the command itself once it's spent
 * longer than this actually processing frames. It's a backstop for genuinely runaway
 * commands, not the primary fix for a slow one (a pathological filter graph can still
 * take a while before the first progress tick even fires).
 */
export async function runTracked(
  ffmpeg: FFmpeg,
  args: string[],
  options: {
    onLog?: (line: string) => void
    onProgress?: (timeSeconds: number) => void
    timeoutMs?: number
    /** Some callers (probing with no output) deliberately expect a non-zero exit — opt in per call. */
    checkExitCode?: boolean
  } = {},
): Promise<void> {
  const { onLog, onProgress, timeoutMs, checkExitCode } = options
  const logHandler = ({ message }: { message: string }) => onLog?.(message)
  const progressHandler = ({ time }: { progress: number; time: number }) => {
    // ffmpeg.wasm reports `time` in microseconds of media processed so far.
    onProgress?.(time / 1_000_000)
  }
  if (onLog) ffmpeg.on('log', logHandler)
  if (onProgress) ffmpeg.on('progress', progressHandler)
  try {
    const returnCode = await ffmpeg.exec(args, timeoutMs ?? -1)
    if (checkExitCode && returnCode !== 0) {
      throw new Error(`ffmpeg exited with code ${returnCode}${timeoutMs ? ' (có thể do hết thời gian chờ)' : ''}`)
    }
  } finally {
    if (onLog) ffmpeg.off('log', logHandler)
    if (onProgress) ffmpeg.off('progress', progressHandler)
  }
}

/** Whether the probed input has at least one audio stream — checked before running any
 * audio-only pass (silence/energy/transcription), since forcing `-c:a aac` or extracting
 * audio from a video with no audio track makes ffmpeg fail outright. */
export function hasAudioStream(logLines: string[]): boolean {
  return logLines.some((line) => /Stream #\d+:\d+.*:\s*Audio:/.test(line))
}

export function parseDurationSeconds(logLines: string[]): number | null {
  for (const line of logLines) {
    const match = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (match) {
      const [, h, m, s] = match
      return Number(h) * 3600 + Number(m) * 60 + Number(s)
    }
  }
  return null
}

export interface SilenceRange {
  start: number
  end: number
}

export function parseSilenceRanges(logLines: string[]): SilenceRange[] {
  const ranges: SilenceRange[] = []
  let pendingStart: number | null = null
  for (const line of logLines) {
    const startMatch = line.match(/silence_start:\s*(\d+(?:\.\d+)?)/)
    if (startMatch) {
      pendingStart = Number(startMatch[1])
      continue
    }
    const endMatch = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/)
    if (endMatch && pendingStart !== null) {
      ranges.push({ start: pendingStart, end: Number(endMatch[1]) })
      pendingStart = null
    }
  }
  return ranges
}

export function parseSceneTimestamps(logLines: string[]): number[] {
  const points: number[] = []
  for (const line of logLines) {
    const match = line.match(/pts_time:(\d+(?:\.\d+)?)/)
    if (match) points.push(Number(match[1]))
  }
  return points
}
