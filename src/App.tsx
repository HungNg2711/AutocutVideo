import { useState } from 'react'
import Header from './components/Header'
import UploadZone from './components/UploadZone'
import ClipSettingsPanel from './components/ClipSettingsPanel'
import ProcessingView from './components/ProcessingView'
import ClipGrid from './components/ClipGrid'
import { useVideoSplitter } from './hooks/useVideoSplitter'
import type { SplitSettings } from './types'

const DEFAULT_SETTINGS: SplitSettings = {
  targetDuration: 30,
  minDuration: 12,
  maxDuration: 60,
  verticalCrop: true,
  generateSubtitles: true,
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [settings, setSettings] = useState<SplitSettings>(DEFAULT_SETTINGS)
  const { progress, clips, sourceDuration, process, reset, cancel } = useVideoSplitter()

  const handleReset = () => {
    setFile(null)
    setSettings(DEFAULT_SETTINGS)
    reset()
  }

  const isProcessing = progress.stage !== 'idle' && progress.stage !== 'done' && progress.stage !== 'error'
  const isDone = progress.stage === 'done' && clips.length > 0

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

        {!file && progress.stage === 'idle' && <UploadZone onSelect={setFile} />}

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

        {isDone && <ClipGrid clips={clips} sourceDuration={sourceDuration} onReset={handleReset} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-muted-foreground sm:px-6">
        Video của bạn không được tải lên máy chủ nào — toàn bộ quá trình phân tích và cắt diễn ra ngay trên trình duyệt.
      </footer>
    </div>
  )
}
