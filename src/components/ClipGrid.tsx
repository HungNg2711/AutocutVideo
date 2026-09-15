import { ArrowCounterClockwise } from '@phosphor-icons/react'
import type { GeneratedClip } from '../types'
import ClipCard from './ClipCard'
import { formatTime } from '../lib/splitter'

interface ClipGridProps {
  clips: GeneratedClip[]
  sourceDuration: number | null
  onReset: () => void
}

export default function ClipGrid({ clips, sourceDuration, onReset }: ClipGridProps) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">
            Đã tạo {clips.length} clip{sourceDuration ? ` từ video ${formatTime(sourceDuration)}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">Xem trước và tải các clip bạn muốn đăng lên TikTok.</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50"
        >
          <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" />
          Cắt video khác
        </button>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {clips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} />
        ))}
      </div>
    </div>
  )
}
