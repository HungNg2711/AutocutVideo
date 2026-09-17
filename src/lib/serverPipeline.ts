import type { SubtitleCue } from '../types'

const SERVER_URL = import.meta.env.VITE_AUTOCUT_SERVER_URL as string | undefined
const API_KEY = import.meta.env.VITE_AUTOCUT_SERVER_API_KEY as string | undefined

export function isServerConfigured(): boolean {
  return Boolean(SERVER_URL && API_KEY)
}

async function callServer<T>(path: string, body: unknown): Promise<T> {
  if (!SERVER_URL || !API_KEY) {
    throw new Error('Server chưa được cấu hình (thiếu VITE_AUTOCUT_SERVER_URL / VITE_AUTOCUT_SERVER_API_KEY).')
  }
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.error || `Server trả về lỗi HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Uploads the source video directly to R2 (bypassing the server entirely) via a
 * short-lived presigned URL, so we're never limited by Cloud Run's request-size ceiling. */
export async function uploadSourceVideo(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const { uploadUrl, publicUrl } = await callServer<{ uploadUrl: string; publicUrl: string }>('/uploads', {
    filename: file.name,
    contentType: file.type || 'video/mp4',
  })

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload thất bại (HTTP ${xhr.status})`)))
    xhr.onerror = () => reject(new Error('Upload lên R2 thất bại (lỗi mạng)'))
    xhr.send(file)
  })

  return publicUrl
}

export interface ServerCutSegment {
  id: string
  start: number
  end: number
  verticalCrop: boolean
  speed: number
  cues?: SubtitleCue[]
}

export interface ServerCutClip {
  id: string
  url: string
  size: number
}

/** One request cuts every requested segment server-side with real ffmpeg and returns
 * each clip's R2 URL — no need to download/re-upload anything on the client. */
export async function requestCutJob(videoUrl: string, segments: ServerCutSegment[]): Promise<ServerCutClip[]> {
  const result = await callServer<{ clips: ServerCutClip[] }>('/jobs', { videoUrl, segments })
  return result.clips
}
