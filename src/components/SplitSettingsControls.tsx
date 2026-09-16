import { useState } from 'react'
import { ClosedCaptioning, DeviceMobile, GearSix, Stack } from '@phosphor-icons/react'
import type { SplitSettings } from '../types'
import ScoringWeightsPanel from './ScoringWeightsPanel'

const MAX_MANUAL_CLIP_COUNT = 30
const DEFAULT_MANUAL_CLIP_COUNT = 12

interface SplitSettingsControlsProps {
  settings: SplitSettings
  onChange: (settings: SplitSettings) => void
}

/** The cutting parameters (duration, crop, subtitles, scoring weights) — shared between
 * the pre-upload "default settings" section and the per-file settings panel, so tuning
 * them once carries over instead of needing to be redone after every upload. */
export default function SplitSettingsControls({ settings, onChange }: SplitSettingsControlsProps) {
  const [showWeights, setShowWeights] = useState(false)

  return (
    <div className="space-y-5">
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

      <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
        <label className="flex cursor-pointer items-center justify-between">
          <span className="flex items-center gap-2.5">
            <Stack size={18} weight="bold" className="text-accent" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium">Số lượng clip mong muốn</span>
              <span className="block text-xs text-muted-foreground">
                Tắt: hệ thống tự chia. Bật: cắt đúng số clip bạn nhập (tuỳ video có đủ đoạn phù hợp)
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.clipCount != null}
            onChange={(e) =>
              onChange({ ...settings, clipCount: e.target.checked ? DEFAULT_MANUAL_CLIP_COUNT : undefined })
            }
            className="h-5 w-5 shrink-0 accent-primary"
          />
        </label>
        {settings.clipCount != null && (
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={MAX_MANUAL_CLIP_COUNT}
              step={1}
              value={settings.clipCount}
              onChange={(e) => onChange({ ...settings, clipCount: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <input
              type="number"
              min={1}
              max={MAX_MANUAL_CLIP_COUNT}
              value={settings.clipCount}
              onChange={(e) => {
                const value = Math.min(MAX_MANUAL_CLIP_COUNT, Math.max(1, Number(e.target.value) || 1))
                onChange({ ...settings, clipCount: value })
              }}
              className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-1 text-center text-sm font-semibold text-primary"
            />
          </div>
        )}
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
            <span className="block text-sm font-medium">Tự động thêm phụ đề &amp; chọn đoạn hay nhất</span>
            <span className="block text-xs text-muted-foreground">
              Dùng transcript để chấm điểm hook/nội dung khi chọn clip, và burn phụ đề — lần đầu sẽ mất thêm thời
              gian tải mô hình. Tắt đi thì chỉ chọn clip theo hình ảnh/âm thanh, không có phụ đề.
            </span>
          </span>
        </span>
        <input
          type="checkbox"
          checked={settings.generateSubtitles}
          onChange={(e) => onChange({ ...settings, generateSubtitles: e.target.checked })}
          className="h-5 w-5 shrink-0 accent-primary"
        />
      </label>

      <div>
        <button
          type="button"
          onClick={() => setShowWeights((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3 text-left transition-colors hover:border-primary/50"
          aria-expanded={showWeights}
        >
          <span className="flex items-center gap-2.5">
            <GearSix size={18} weight="bold" className="text-accent" aria-hidden="true" />
            <span className="text-sm font-medium">Tuỳ chỉnh cách chấm điểm chọn clip</span>
          </span>
          <span className="text-xs text-muted-foreground">{showWeights ? 'Ẩn' : 'Mở'}</span>
        </button>
        {showWeights && (
          <ScoringWeightsPanel
            weights={settings.scoringWeights}
            onChange={(scoringWeights) => onChange({ ...settings, scoringWeights })}
          />
        )}
      </div>
    </div>
  )
}
