import { useEffect, useState } from 'react'
import { ArrowCounterClockwise, ClosedCaptioning, DeviceMobile, FilmSlate, Info, Sparkle } from '@phosphor-icons/react'
import type { SplitSettings } from '../types'
import { SCENE_DETECTION_MAX_DURATION } from '../hooks/useVideoSplitter'
import { formatTime } from '../lib/splitter'

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

      <div className="mt-6 space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="target-duration" className="text-sm font-medium">
              Độ dài mỗi clip mong muốn
            </label>
            <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold text-primary">{settings.targetDuration}s</span>
          </div>
          <input
            id="target-duration"
            type="range"
            min={15}
            max={60}
            step={1}
            value={settings.targetDuration}
            onChange={(e) => onChange({ ...settings, targetDuration: Number(e.target.value) })}
            className="mt-2 w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>15s</span>
            <span>60s</span>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3">
          <span className="flex items-center gap-2.5">
            <DeviceMobile size={18} weight="bold" className="text-accent" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium">Cắt khung dọc 9:16</span>
              <span className="block text-xs text-muted-foreground">Chuẩn hiển thị TikTok / Reels / Shorts</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.verticalCrop}
            onChange={(e) => onChange({ ...settings, verticalCrop: e.target.checked })}
            className="h-5 w-5 shrink-0 accent-primary"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3">
          <span className="flex items-center gap-2.5">
            <ClosedCaptioning size={18} weight="bold" className="text-accent" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium">Tự động thêm phụ đề</span>
              <span className="block text-xs text-muted-foreground">Nhận diện giọng nói ngay trên trình duyệt — lần đầu sẽ mất thêm thời gian tải mô hình</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.generateSubtitles}
            onChange={(e) => onChange({ ...settings, generateSubtitles: e.target.checked })}
            className="h-5 w-5 shrink-0 accent-primary"
          />
        </label>
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
