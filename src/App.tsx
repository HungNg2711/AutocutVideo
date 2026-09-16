import { useState } from 'react'
import { GearSix } from '@phosphor-icons/react'
import Header from './components/Header'
import UploadZone from './components/UploadZone'
import ClipSettingsPanel from './components/ClipSettingsPanel'
import SplitSettingsControls from './components/SplitSettingsControls'
import ProcessingView from './components/ProcessingView'
import ClipGrid from './components/ClipGrid'
import { useVideoSplitter } from './hooks/useVideoSplitter'
import type { SplitSettings } from './types'
import { DEFAULT_SCORING_WEIGHTS } from './types'

const DEFAULT_SETTINGS: SplitSettings = {
  targetDuration: 30,
  minDuration: 12,
  maxDuration: 60,
  verticalCrop: true,
  generateSubtitles: true,
  scoringWeights: DEFAULT_SCORING_WEIGHTS,
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [settings, setSettings] = useState<SplitSettings>(DEFAULT_SETTINGS)
  const [showDefaultSettings, setShowDefaultSettings] = useState(false)
  const { progress, clips, sourceDuration, process, reset, cancel } = useVideoSplitter()

  // Deliberately keeps `settings` as-is — once you've tuned duration/subtitles/weights,
  // that carries over to the next upload instead of resetting to defaults every time.
  const handleReset = async () => {
    await cancel()
    reset()
    setFile(null)
  }

  const isProcessing = progress.stage !== 'idle' && progress.stage !== 'done' && progress.stage !== 'error'
  const hasClips = clips.length > 0

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        {!file && progress.stage === 'idle' && (
          <section className="flex flex-col items-center gap-3 text-center">
            <h1 className="max-w-xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              Biến video dài thành clip ngắn chuẩn TikTok
            </h1>
            <p className="max-w-lg text-balance text-muted-foreground">
              Tải video lên, Autocut sẽ tự động phát hiện chuyển cảnh và khoảng lặng để cắt thành nhiều clip ngắn,
              xem trước và tải về máy — tất cả ngay trên trình duyệt của bạn.
            </p>
          </section>
        )}

        {!file && progress.stage === 'idle' && (
          <>
            <UploadZone onSelect={setFile} />
            <div className="mx-auto w-full max-w-2xl">
              <button
                type="button"
                onClick={() => setShowDefaultSettings((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
                aria-expanded={showDefaultSettings}
              >
                <span className="flex items-center gap-2.5">
                  <GearSix size={18} weight="bold" className="text-accent" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-medium">Cài đặt mặc định trước khi tải video</span>
                    <span className="block text-xs text-muted-foreground">
                      Cấu hình một lần, áp dụng cho mọi video bạn tải lên sau này
                    </span>
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{showDefaultSettings ? 'Ẩn' : 'Mở'}</span>
              </button>
              {showDefaultSettings && (
                <div className="mt-3 rounded-2xl border border-border bg-card p-6">
                  <SplitSettingsControls settings={settings} onChange={setSettings} />
                </div>
              )}
            </div>
          </>
        )}

        {file && progress.stage === 'idle' && (
          <ClipSettingsPanel
            file={file}
            settings={settings}
            onChange={setSettings}
            onStart={() => process(file, settings)}
            onReset={handleReset}
          />
        )}

        {(isProcessing || progress.stage === 'error') && (
          <ProcessingView
            progress={progress}
            subtitlesEnabled={settings.generateSubtitles}
            onRetry={handleReset}
            onCancel={cancel}
          />
        )}

        {hasClips && (
          <ClipGrid clips={clips} sourceDuration={sourceDuration} isProcessing={isProcessing} onReset={handleReset} />
        )}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-muted-foreground sm:px-6">
        Video của bạn không được tải lên máy chủ nào — toàn bộ quá trình phân tích và cắt diễn ra ngay trên trình duyệt.
      </footer>
    </div>
  )
}
