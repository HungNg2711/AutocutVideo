import { ClosedCaptioning, DownloadSimple } from '@phosphor-icons/react'
import type { GeneratedClip } from '../types'
import { REASON_LABEL } from '../types'
import { formatTime } from '../lib/splitter'

interface ClipCardProps {
  clip: GeneratedClip
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function ClipCard({ clip }: ClipCardProps) {
  const duration = clip.end - clip.start
  const fileName = `autocut-clip-${clip.index + 1}.mp4`

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-[9/16] w-full bg-black">
        <video
          src={clip.url}
          controls
          preload="metadata"
          playsInline
          className="h-full w-full object-contain"
          aria-label={`Clip ${clip.index + 1}, từ ${formatTime(clip.start)} đến ${formatTime(clip.end)}`}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
          {formatTime(duration)}
        </span>
        {clip.hasSubtitles && (
          <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
            <ClosedCaptioning size={14} weight="bold" aria-hidden="true" />
            Phụ đề
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Clip {clip.index + 1}</p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {REASON_LABEL[clip.reason]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatTime(clip.start)} – {formatTime(clip.end)} · {formatBytes(clip.size)}
        </p>
        <a
          href={clip.url}
          download={fileName}
          className="mt-auto flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <DownloadSimple size={16} weight="bold" aria-hidden="true" />
          Tải về máy
        </a>
      </div>
    </div>
  )
}
