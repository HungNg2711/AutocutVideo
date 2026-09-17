import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { cutSegment, probe } from './ffmpeg.js'
import { getUploadUrl, uploadFile } from './r2.js'
import type { SubtitleCue } from './subtitles.js'

const app = express()
app.use(express.json({ limit: '2mb' })) // just the job description (URLs + cue text), not the video itself

// The frontend runs on a different origin (Cloudflare Pages / localhost dev) — allow it
// to call this API. Restrict to one origin via ALLOWED_ORIGIN once you have a real domain;
// "*" is fine for now since every real request still needs the API key below.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// Basic shared-secret auth — this endpoint spends real CPU/money per request, so it must
// not be left open to the public internet. Set API_KEY in Cloud Run and send it from the
// frontend as `x-api-key`.
app.use((req, res, next) => {
  if (req.path === '/health') return next()
  const key = req.header('x-api-key')
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/uploads', async (req, res) => {
  const { filename, contentType } = (req.body ?? {}) as { filename?: string; contentType?: string }
  if (!filename) {
    res.status(400).json({ error: 'filename is required' })
    return
  }
  try {
    const key = `sources/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const result = await getUploadUrl(key, contentType || 'application/octet-stream')
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

interface CutSegmentInput {
  id: string
  start: number
  end: number
  verticalCrop?: boolean
  speed?: number
  cues?: SubtitleCue[]
}

interface JobRequest {
  videoUrl: string
  segments: CutSegmentInput[]
}

async function downloadTo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Failed to download source video: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath))
}

app.post('/jobs', async (req, res) => {
  const body = req.body as Partial<JobRequest>
  if (!body.videoUrl || !Array.isArray(body.segments) || body.segments.length === 0) {
    res.status(400).json({ error: 'videoUrl and a non-empty segments array are required' })
    return
  }

  const jobId = randomUUID()
  const workDir = await mkdtemp(path.join(tmpdir(), 'autocut-'))
  const inputPath = path.join(workDir, 'input.mp4')

  try {
    await downloadTo(body.videoUrl, inputPath)
    const info = await probe(inputPath)

    const clips: { id: string; url: string; size: number }[] = []
    for (const segment of body.segments) {
      const outputPath = path.join(workDir, `${segment.id}.mp4`)
      await cutSegment(inputPath, outputPath, {
        id: segment.id,
        start: segment.start,
        end: segment.end,
        verticalCrop: segment.verticalCrop ?? true,
        speed: segment.speed ?? 1,
        cues: info.hasAudio ? segment.cues : undefined,
      })
      const { size } = await stat(outputPath)
      const url = await uploadFile(outputPath, `clips/${jobId}/${segment.id}.mp4`, 'video/mp4')
      clips.push({ id: segment.id, url, size })
    }

    res.json({ jobId, durationSeconds: info.durationSeconds, hasAudio: info.hasAudio, clips })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[autocut-server] job ${jobId} failed`, err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
})

const port = Number(process.env.PORT) || 8080
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`autocut-server listening on :${port}`)
})
