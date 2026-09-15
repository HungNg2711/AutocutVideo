import { CheckCircle, CircleNotch, Warning, X } from '@phosphor-icons/react'
import type { Stage, StageProgress } from '../types'
import { formatTime } from '../lib/splitter'

const ORDER: Stage[] = ['loading-engine', 'probing', 'detecting', 'transcribing', 'cutting', 'done']

const ALL_STEPS: { stage: Stage; label: string }[] = [
  { stage: 'loading-engine', label: 'Khởi động công cụ xử lý' },
  { stage: 'probing', label: 'Đọc thông tin video' },
  { stage: 'detecting', label: 'Phân tích cảnh quay & giọng nói' },
  { stage: 'transcribing', label: 'Nhận diện giọng nói & tạo phụ đề' },
  { stage: 'cutting', label: 'Cắt & xuất clip' },
]

function stepStatus(stepStage: Stage, current: Stage): 'done' | 'active' | 'pending' {
  const stepIndex = ORDER.indexOf(stepStage)
  const currentIndex = ORDER.indexOf(current)
  if (currentIndex > stepIndex) return 'done'
  if (currentIndex === stepIndex) return 'active'
  return 'pending'
}

interface ProcessingViewProps {
  progress: StageProgress
  subtitlesEnabled: boolean
  onRetry: () => void
  onCancel: () => void
}

export default function ProcessingView({ progress, subtitlesEnabled, onRetry, onCancel }: ProcessingViewProps) {
  const isError = progress.stage === 'error'
  const steps = subtitlesEnabled ? ALL_STEPS : ALL_STEPS.filter((step) => step.stage !== 'transcribing')

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-8">
      {isError ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
            <Warning size={26} weight="bold" className="text-destructive" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold">Không thể xử lý video</p>
            <p role="alert" className="mt-1 text-sm text-muted-foreground">{progress.error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Thử lại với video khác
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <CircleNotch size={40} weight="bold" className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            </span>
            <p className="text-base font-semibold" aria-live="polite">
              {progress.label}
            </p>
            {progress.stage === 'cutting' && progress.totalClips && (
              <p className="text-sm text-muted-foreground">
                Clip {progress.currentClip}/{progress.totalClips}
              </p>
            )}
            {progress.totalSeconds != null && progress.elapsedSeconds != null && (
              <p className="text-sm text-muted-foreground">
                Đã xử lý {formatTime(progress.elapsedSeconds)} / {formatTime(progress.totalSeconds)}
              </p>
            )}
          </div>

          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round(progress.overall * 100)}%` }}
            />
          </div>

          <ol className="mt-6 space-y-3">
            {steps.map((step) => {
              const status = stepStatus(step.stage, progress.stage)
              return (
                <li key={step.stage} className="flex items-center gap-3 text-sm">
                  {status === 'done' ? (
                    <CheckCircle size={18} weight="fill" className="shrink-0 text-primary" aria-hidden="true" />
                  ) : status === 'active' ? (
                    <CircleNotch size={18} weight="bold" className="shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-border" aria-hidden="true" />
                  )}
                  <span className={status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>{step.label}</span>
                </li>
              )
            })}
          </ol>

          <button
            type="button"
            onClick={onCancel}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            <X size={16} weight="bold" aria-hidden="true" />
            Hủy xử lý
          </button>
        </>
      )}
    </div>
  )
}
