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
): Promise<Uint8Array> {
  const outName = 'audio-16k-mono.wav'
  const args: string[] = []
  if (startSeconds != null) args.push('-ss', String(startSeconds))
  if (endSeconds != null) args.push('-to', String(endSeconds))
  args.push('-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', outName)
  await ffmpeg.exec(args)
  const data = await ffmpeg.readFile(outName)
  await ffmpeg.deleteFile(outName)
  return data as Uint8Array
}

/**
 * Runs an ffmpeg command while optionally collecting stderr log lines and/or
 * reporting live time-based progress (so long operations don't look frozen).
 */
export async function runTracked(
  ffmpeg: FFmpeg,
  args: string[],
  options: { onLog?: (line: string) => void; onProgress?: (timeSeconds: number) => void } = {},
): Promise<void> {
  const { onLog, onProgress } = options
  const logHandler = ({ message }: { message: string }) => onLog?.(message)
  const progressHandler = ({ time }: { progress: number; time: number }) => {
    // ffmpeg.wasm reports `time` in microseconds of media processed so far.
    onProgress?.(time / 1_000_000)
  }
  if (onLog) ffmpeg.on('log', logHandler)
  if (onProgress) ffmpeg.on('progress', progressHandler)
  try {
    await ffmpeg.exec(args)
  } finally {
    if (onLog) ffmpeg.off('log', logHandler)
    if (onProgress) ffmpeg.off('progress', progressHandler)
  }
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

export function parseSilenceMidpoints(logLines: string[]): number[] {
  const starts: number[] = []
  const points: number[] = []
  let pendingStart: number | null = null
  for (const line of logLines) {
    const startMatch = line.match(/silence_start:\s*(\d+(?:\.\d+)?)/)
    if (startMatch) {
      pendingStart = Number(startMatch[1])
      starts.push(pendingStart)
      continue
    }
    const endMatch = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/)
    if (endMatch && pendingStart !== null) {
      const end = Number(endMatch[1])
      points.push((pendingStart + end) / 2)
      pendingStart = null
    }
  }
  return points
}

export function parseSceneTimestamps(logLines: string[]): number[] {
  const points: number[] = []
  for (const line of logLines) {
    const match = line.match(/pts_time:(\d+(?:\.\d+)?)/)
    if (match) points.push(Number(match[1]))
  }
  return points
}
