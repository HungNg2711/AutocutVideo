import { ArrowCounterClockwise, CircleNotch } from '@phosphor-icons/react'
import type { GeneratedClip } from '../types'
import ClipCard from './ClipCard'
import { formatTime } from '../lib/splitter'

interface ClipGridProps {
  clips: GeneratedClip[]
  sourceDuration: number | null
  isProcessing?: boolean
  onReset: () => void
}

export default function ClipGrid({ clips, sourceDuration, isProcessing, onReset }: ClipGridProps) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold">
            {isProcessing ? (
              <>
                <CircleNotch size={18} weight="bold" className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                Đã xong {clips.length} clip, đang cắt tiếp…
              </>
            ) : (
              <>Đã tạo {clips.length} clip{sourceDuration ? ` từ video ${formatTime(sourceDuration)}` : ''}</>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {isProcessing
              ? 'Bạn có thể xem trước và tải ngay các clip đã xong trong lúc chờ.'
              : 'Xem trước và tải các clip bạn muốn đăng lên TikTok.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50"
        >
          <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" />
          {isProcessing ? 'Huỷ & cắt video khác' : 'Cắt video khác'}
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
