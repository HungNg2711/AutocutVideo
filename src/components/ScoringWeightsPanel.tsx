import { ArrowCounterClockwise } from '@phosphor-icons/react'
import type { ScoringWeights } from '../types'
import { DEFAULT_SCORING_WEIGHTS } from '../types'

interface WeightConfig {
  key: keyof ScoringWeights
  label: string
  hint: string
}

const WEIGHT_CONFIGS: WeightConfig[] = [
  { key: 'hook', label: 'Độ mạnh câu mở đầu (hook)', hint: 'Câu hỏi, số liệu, từ khoá gây chú ý ở đầu đoạn' },
  { key: 'sceneDensity', label: 'Mật độ chuyển cảnh', hint: 'Đoạn có nhiều chuyển động/thay đổi hình ảnh' },
  { key: 'audioEnergy', label: 'Cao trào giọng nói', hint: 'Đoạn có âm lượng/cảm xúc giọng nói nổi bật' },
  { key: 'selfContained', label: 'Trọn vẹn ý (không cắt giữa câu)', hint: 'Điểm bắt đầu/kết thúc trùng ranh giới câu nói' },
  { key: 'deadAir', label: 'Phạt khoảng lặng', hint: 'Trừ điểm đoạn có nhiều khoảng im lặng' },
]

interface ScoringWeightsPanelProps {
  weights: ScoringWeights
  onChange: (weights: ScoringWeights) => void
}

export default function ScoringWeightsPanel({ weights, onChange }: ScoringWeightsPanelProps) {
  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Trọng số chọn clip hay nhất</p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_SCORING_WEIGHTS)}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowCounterClockwise size={13} weight="bold" aria-hidden="true" />
          Về mặc định
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Điều chỉnh mức độ ưu tiên khi hệ thống chấm điểm và chọn đoạn nào trở thành clip. Không có công thức cố
        định — bạn có thể tinh chỉnh theo loại nội dung của mình.
      </p>
      {WEIGHT_CONFIGS.map(({ key, label, hint }) => (
        <div key={key}>
          <div className="flex items-center justify-between">
            <label htmlFor={`weight-${key}`} className="text-sm font-medium">
              {label}
            </label>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-primary">
              {weights[key].toFixed(2)}
            </span>
          </div>
          <input
            id={`weight-${key}`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={weights[key]}
            onChange={(e) => onChange({ ...weights, [key]: Number(e.target.value) })}
            className="mt-1.5 w-full accent-primary"
          />
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      ))}
    </div>
  )
}
