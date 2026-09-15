import { useCallback, useId, useRef, useState } from 'react'
import { UploadSimple, Warning } from '@phosphor-icons/react'

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
const MAX_SIZE_BYTES = 1024 * 1024 * 1024 // 1GB — browser memory guard for client-side processing

interface UploadZoneProps {
  onSelect: (file: File) => void
}

export default function UploadZone({ onSelect }: UploadZoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateAndEmit = useCallback(
    (file: File | undefined) => {
      if (!file) return
      const looksLikeVideo = file.type.startsWith('video/') || ACCEPTED_TYPES.includes(file.type)
      if (!looksLikeVideo) {
        setError('Định dạng không được hỗ trợ. Vui lòng chọn file video (MP4, MOV, WebM, MKV).')
        return
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError('File quá lớn (>1GB). Trình duyệt có thể bị treo khi xử lý — vui lòng chọn video nhỏ hơn.')
        return
      }
      setError(null)
      onSelect(file)
    },
    [onSelect],
  )

  return (
    <div className="mx-auto w-full max-w-2xl">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          validateAndEmit(e.dataTransfer.files?.[0])
        }}
        className={`group flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors duration-200 ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:bg-card/80'
        }`}
      >
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
          <span className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-ring motion-reduce:hidden" aria-hidden="true" />
          <UploadSimple size={28} weight="bold" className="text-white" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-semibold">Kéo thả video vào đây</p>
          <p className="mt-1 text-sm text-muted-foreground">hoặc bấm để chọn file từ máy tính</p>
        </div>
        <span className="pointer-events-none rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform group-hover:scale-[1.03]">
          Chọn video
        </span>
        <p className="text-xs text-muted-foreground">Hỗ trợ MP4, MOV, WebM, MKV · Tối đa 1GB · Xử lý hoàn toàn trên trình duyệt của bạn</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(e) => validateAndEmit(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Warning size={16} weight="bold" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
