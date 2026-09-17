import { spawn } from 'node:child_process'
import { buildSubtitleFilter, type SubtitleCue } from './subtitles.js'

export interface CutSegment {
  id: string
  start: number
  end: number
  verticalCrop: boolean
  speed: number
  cues?: SubtitleCue[]
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-nostdin', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      // Keep only the tail — full ffmpeg logs for a big file can be huge.
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
  })
}

/** Cuts one segment out of `inputPath` with real ffmpeg (native libx264, no WASM ceiling). */
export async function cutSegment(inputPath: string, outputPath: string, segment: CutSegment): Promise<void> {
  const baseFilter = segment.verticalCrop
    ? 'crop=min(iw\\,ih*9/16):ih,scale=1080:1920,setsar=1'
    : 'scale=1080:-2,setsar=1'
  const subtitleFilter = segment.cues?.length ? buildSubtitleFilter(segment.cues, segment.start, segment.end) : ''
  const speed = segment.speed || 1
  const vfParts = [baseFilter]
  if (subtitleFilter) vfParts.push(subtitleFilter)
  if (speed !== 1) vfParts.push(`setpts=PTS/${speed}`)

  const audioArgs = speed !== 1 ? ['-af', `atempo=${speed}`, '-c:a', 'aac', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '128k']

  await runFFmpeg([
    '-ss', String(segment.start),
    '-to', String(segment.end),
    '-i', inputPath,
    '-vf', vfParts.join(','),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    ...audioArgs,
    outputPath,
  ])
}

export interface ProbeResult {
  durationSeconds: number
  hasAudio: boolean
}

export async function probe(inputPath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-i', inputPath], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    // `ffmpeg -i <file>` with no output always exits non-zero — that's expected, we only
    // want the stream info it prints to stderr before bailing.
    proc.on('close', () => {
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!durationMatch) {
        reject(new Error('Could not read video duration'))
        return
      }
      const [, h, m, s] = durationMatch
      const durationSeconds = Number(h) * 3600 + Number(m) * 60 + Number(s)
      const hasAudio = /Stream #\d+:\d+.*:\s*Audio:/.test(stderr)
      resolve({ durationSeconds, hasAudio })
    })
    proc.on('error', reject)
  })
}
