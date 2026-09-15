import { useCallback, useRef, useState } from 'react'
import {
  extractAudioWav,
  getFFmpeg,
  parseDurationSeconds,
  parseSceneTimestamps,
  parseSilenceMidpoints,
  runTracked,
  terminateFFmpeg,
  writeInputFile,
} from '../lib/ffmpeg'
import { buildSegments } from '../lib/splitter'
import { buildSubtitleFilter, decodeWavToFloat32, getSubtitleFontBytes, SUBTITLE_FONT_FS_NAME, transcribeAudio } from '../lib/subtitles'
import type { GeneratedClip, SplitSettings, StageProgress, SubtitleCue } from '../types'

const INPUT_NAME = 'input.mp4'

// Full-resolution scene-change detection means decoding the entire video once just to
// compare frames — for long recordings that single pass can take minutes and makes the
// page look frozen. Past this length we skip it and rely on the much cheaper (audio-only)
// silence detection plus fixed-length fallback cuts instead.
export const SCENE_DETECTION_MAX_DURATION = 600

const INITIAL_PROGRESS: StageProgress = {
  stage: 'idle',
  label: '',
  overall: 0,
}

const CANCELLED_MESSAGE = 'called FFmpeg.terminate()'

export function useVideoSplitter() {
  const [progress, setProgress] = useState<StageProgress>(INITIAL_PROGRESS)
  const [clips, setClips] = useState<GeneratedClip[]>([])
  const [sourceDuration, setSourceDuration] = useState<number | null>(null)
  const clipUrlsRef = useRef<string[]>([])

  const revokeClipUrls = useCallback(() => {
    clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    clipUrlsRef.current = []
  }, [])

  const reset = useCallback(() => {
    revokeClipUrls()
    setClips([])
    setSourceDuration(null)
    setProgress(INITIAL_PROGRESS)
  }, [revokeClipUrls])

  const cancelledRef = useRef(false)

  const process = useCallback(
    async (file: File, settings: SplitSettings) => {
      revokeClipUrls()
      setClips([])
      cancelledRef.current = false
      try {
        setProgress({ stage: 'loading-engine', label: 'Đang khởi động bộ xử lý video…', overall: 0.02 })
        const ffmpeg = await getFFmpeg()

        setProgress({ stage: 'probing', label: 'Đang đọc thông tin video…', overall: 0.08 })
        await writeInputFile(ffmpeg, file, INPUT_NAME)

        const probeLogs: string[] = []
        await runTracked(ffmpeg, ['-i', INPUT_NAME], { onLog: (line) => probeLogs.push(line) })
        const duration = parseDurationSeconds(probeLogs)
        if (!duration || duration < 3) {
          throw new Error('Không đọc được thời lượng video. Vui lòng thử một file khác.')
        }
        setSourceDuration(duration)

        const skipSceneDetection = duration > SCENE_DETECTION_MAX_DURATION
        let sceneTimestamps: number[] = []
        if (!skipSceneDetection) {
          const sceneLogs: string[] = []
          await runTracked(
            ffmpeg,
            // Downsample to a low fps/resolution proxy before diffing frames — decoding the
            // source is unavoidable, but this keeps the per-frame comparison work cheap.
            ['-i', INPUT_NAME, '-vf', "fps=6,scale=256:-2,select='gt(scene,0.35)',showinfo", '-an', '-f', 'null', '-'],
            {
              onLog: (line) => sceneLogs.push(line),
              onProgress: (timeSeconds) =>
                setProgress({
                  stage: 'detecting',
                  label: 'Đang phát hiện chuyển cảnh…',
                  overall: 0.1 + 0.08 * Math.min(1, timeSeconds / duration),
                  elapsedSeconds: timeSeconds,
                  totalSeconds: duration,
                }),
            },
          )
          sceneTimestamps = parseSceneTimestamps(sceneLogs)
        } else {
          setProgress({
            stage: 'detecting',
            label: 'Video dài — bỏ qua phân tích chuyển cảnh để xử lý nhanh hơn…',
            overall: 0.18,
          })
        }

        const silenceLogs: string[] = []
        await runTracked(
          ffmpeg,
          ['-i', INPUT_NAME, '-af', 'silencedetect=noise=-30dB:d=0.6', '-vn', '-f', 'null', '-'],
          {
            onLog: (line) => silenceLogs.push(line),
            onProgress: (timeSeconds) =>
              setProgress({
                stage: 'detecting',
                label: 'Đang phát hiện khoảng lặng trong giọng nói…',
                overall: 0.2 + 0.08 * Math.min(1, timeSeconds / duration),
                elapsedSeconds: timeSeconds,
                totalSeconds: duration,
              }),
          },
        )
        const silenceMidpoints = parseSilenceMidpoints(silenceLogs)

        const segments = buildSegments(duration, sceneTimestamps, silenceMidpoints, settings)
        if (segments.length === 0) {
          throw new Error('Video quá ngắn để tạo clip. Vui lòng thử video dài hơn.')
        }

        let cues: SubtitleCue[] = []
        if (settings.generateSubtitles) {
          setProgress({
            stage: 'transcribing',
            label: 'Đang tải mô hình nhận diện giọng nói (chỉ lần đầu)…',
            overall: 0.32,
          })
          try {
            // Only transcribe the stretch of source video that will actually become clips —
            // for a long video capped at MAX_CLIPS, that can be a small fraction of the total
            // runtime, so this avoids running Whisper over audio nothing will ever use.
            const subtitleRangeStart = segments[0].start
            const subtitleRangeEnd = segments[segments.length - 1].end
            const [wavBytes, fontBytes] = await Promise.all([
              extractAudioWav(ffmpeg, INPUT_NAME, subtitleRangeStart, subtitleRangeEnd),
              getSubtitleFontBytes(),
            ])
            await ffmpeg.writeFile(SUBTITLE_FONT_FS_NAME, fontBytes)

            const audioSamples = await decodeWavToFloat32(wavBytes)
            cues = await transcribeAudio(audioSamples, {
              shouldContinue: () => !cancelledRef.current,
              onProgress: (fraction) =>
                setProgress({
                  stage: 'transcribing',
                  label: `Đang nhận diện giọng nói để tạo phụ đề… ${Math.round(fraction * 100)}%`,
                  overall: 0.35 + 0.15 * fraction,
                }),
            })
            // transcribeAudio() timed cues relative to the extracted (bounded) clip — shift
            // them back to the source video's timeline to match segment start/end times.
            cues = cues.map((cue) => ({
              ...cue,
              start: cue.start + subtitleRangeStart,
              end: cue.end + subtitleRangeStart,
            }))
          } catch (subtitleErr) {
            if (cancelledRef.current) throw subtitleErr
            // Video may have no audio track, or the model failed to load — degrade gracefully.
            // eslint-disable-next-line no-console
            console.error('[autocut] subtitle generation failed, continuing without captions', subtitleErr)
            cues = []
          }
        }

        const cuttingStart = settings.generateSubtitles ? 0.5 : 0.3
        const generated: GeneratedClip[] = []
        for (let i = 0; i < segments.length; i += 1) {
          const seg = segments[i]
          const segDuration = seg.end - seg.start
          const clipBaseOverall = cuttingStart + ((1 - cuttingStart - 0.02) * i) / segments.length
          const clipSlice = (1 - cuttingStart - 0.02) / segments.length
          setProgress({
            stage: 'cutting',
            label: `Đang cắt clip ${i + 1}/${segments.length}…`,
            overall: clipBaseOverall,
            currentClip: i + 1,
            totalClips: segments.length,
          })

          const outName = `clip-${i}.mp4`
          const baseFilter = settings.verticalCrop
            ? 'crop=min(iw\\,ih*9/16):ih,scale=1080:1920,setsar=1'
            : 'scale=1080:-2,setsar=1'
          const subtitleFilter = settings.generateSubtitles ? buildSubtitleFilter(cues, seg.start, seg.end) : ''
          const vf = subtitleFilter ? `${baseFilter},${subtitleFilter}` : baseFilter

          await runTracked(
            ffmpeg,
            [
              '-ss', String(seg.start),
              '-to', String(seg.end),
              '-i', INPUT_NAME,
              '-vf', vf,
              '-c:v', 'libx264',
              '-preset', 'veryfast',
              '-crf', '26',
              '-c:a', 'aac',
              '-b:a', '128k',
              outName,
            ],
            {
              onProgress: (timeSeconds) =>
                setProgress({
                  stage: 'cutting',
                  label: `Đang cắt clip ${i + 1}/${segments.length}…`,
                  overall: clipBaseOverall + clipSlice * Math.min(1, timeSeconds / Math.max(segDuration, 1)),
                  currentClip: i + 1,
                  totalClips: segments.length,
                }),
            },
          )

          const data = await ffmpeg.readFile(outName)
          const bytes = data as Uint8Array
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })
          const url = URL.createObjectURL(blob)
          clipUrlsRef.current.push(url)
          generated.push({ ...seg, url, size: blob.size, hasSubtitles: Boolean(subtitleFilter) })
          await ffmpeg.deleteFile(outName)
        }

        await ffmpeg.deleteFile(INPUT_NAME)
        setClips(generated)
        setProgress({ stage: 'done', label: 'Hoàn tất!', overall: 1 })
      } catch (err) {
        if (cancelledRef.current) {
          // cancel() already reset the UI — this rejection is just terminate() unwinding.
          cancelledRef.current = false
          return
        }
        // eslint-disable-next-line no-console
        console.error('[autocut] pipeline error', err)
        const message =
          err instanceof Error && err.message !== CANCELLED_MESSAGE
            ? err.message
            : 'Đã xảy ra lỗi không xác định.'
        setProgress({ stage: 'error', label: message, overall: 0, error: message })
      }
    },
    [revokeClipUrls],
  )

  const cancel = useCallback(async () => {
    cancelledRef.current = true
    await terminateFFmpeg()
    setProgress(INITIAL_PROGRESS)
  }, [])

  return { progress, clips, sourceDuration, process, reset, cancel }
}
