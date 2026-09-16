import { useEffect, useState } from 'react'
import { ArrowCounterClockwise, FilmSlate, Info, Sparkle } from '@phosphor-icons/react'
import type { SplitSettings } from '../types'
import { SCENE_DETECTION_MAX_DURATION } from '../hooks/useVideoSplitter'
import { formatTime } from '../lib/splitter'
import SplitSettingsControls from './SplitSettingsControls'

interface ClipSettingsPanelProps {
  file: File
  settings: SplitSettings
  onChange: (settings: SplitSettings) => void
  onStart: () => void
  onReset: () => void
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export default function ClipSettingsPanel({ file, settings, onChange, onStart, onReset }: ClipSettingsPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewDuration, setPreviewDuration] = useState<number | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setPreviewDuration(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const isLongVideo = previewDuration != null && previewDuration > SCENE_DETECTION_MAX_DURATION

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
            <FilmSlate size={22} weight="bold" className="text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
          Đổi video khác
        </button>
      </div>

      {previewUrl && (
        <div className="mt-4 overflow-hidden rounded-xl bg-black">
          <video
            src={previewUrl}
            controls
            preload="metadata"
            playsInline
            className="mx-auto max-h-[360px] w-full object-contain"
            aria-label={`Xem trước ${file.name} trước khi xử lý`}
            onLoadedMetadata={(e) => setPreviewDuration(e.currentTarget.duration)}
          />
        </div>
      )}

      {isLongVideo && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Info size={15} weight="bold" className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          Video dài {formatTime(previewDuration ?? 0)} — để xử lý nhanh hơn, Autocut sẽ bỏ qua bước phân tích
          chuyển cảnh và cắt dựa theo khoảng lặng giọng nói. Quá trình vẫn có thể mất vài phút tuỳ máy của bạn.
        </p>
      )}

      <div className="mt-6">
        <SplitSettingsControls settings={settings} onChange={onChange} />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <Sparkle size={18} weight="fill" aria-hidden="true" />
        Bắt đầu phân tích &amp; cắt video
      </button>
    </div>
  )
}
