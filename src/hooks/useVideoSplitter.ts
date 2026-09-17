import { useCallback, useRef, useState } from 'react'
import {
  extractAudioWav,
  getFFmpeg,
  hasAudioStream,
  parseDurationSeconds,
  parseSceneTimestamps,
  parseSilenceRanges,
  runTracked,
  terminateFFmpeg,
  writeInputFile,
} from '../lib/ffmpeg'
import { buildSegments, MAX_CLIPS } from '../lib/splitter'
import { buildSubtitleFilter, decodeWavToFloat32, getSubtitleFontBytes, SUBTITLE_FONT_FS_NAME, transcribeAudio } from '../lib/subtitles'
import { computeEnergyCurve, deadAirRatio, overallPeakRms, peakEnergyInRange } from '../lib/audioEnergy'
import { combineScore, hookScore, sceneDensityScore, selfContainedScore } from '../lib/scoring'
import type { CandidateSignals } from '../lib/scoring'
import { isServerConfigured, requestCutJob, uploadSourceVideo } from '../lib/serverPipeline'
import type { ServerCutSegment } from '../lib/serverPipeline'
import { ENCODE_PRESET_MAP } from '../types'
import type { ClipSegment, GeneratedClip, SplitSettings, StageProgress, SubtitleCue } from '../types'

const INPUT_NAME = 'input.mp4'

// Full-resolution scene-change detection means decoding the entire video once just to
// compare frames — for long recordings that single pass can take minutes and makes the
// page look frozen. Past this length we skip it and rely on the much cheaper (audio-only)
// silence detection plus fixed-length fallback cuts instead.
export const SCENE_DETECTION_MAX_DURATION = 600

// How many candidates (relative to the final clip count) get a full Whisper-based score
// refinement. Keeps transcription bounded even when the cheap first pass turns up far
// more candidates than we'll ever use (long videos).
const CANDIDATE_POOL_MULTIPLIER = 2
// Safety cap on how many chronological candidates we ever generate — the loop already
// terminates on its own once it reaches the end of the video, this just bounds worst case.
const CANDIDATE_GENERATION_CAP = 2000

const INITIAL_PROGRESS: StageProgress = {
  stage: 'idle',
  label: '',
  overall: 0,
}

const CANCELLED_MESSAGE = 'called FFmpeg.terminate()'

interface ScoredCandidate extends ClipSegment {
  signals: CandidateSignals
}

function segmentsOverlap(a: ClipSegment, b: ClipSegment): boolean {
  return a.start < b.end && b.start < a.end
}

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

        setProgress({ stage: 'probing', label: 'Đang đọc thông tin video…', overall: 0.06 })
        await writeInputFile(ffmpeg, file, INPUT_NAME)

        const probeLogs: string[] = []
        await runTracked(ffmpeg, ['-i', INPUT_NAME], { onLog: (line) => probeLogs.push(line) })
        const duration = parseDurationSeconds(probeLogs)
        if (!duration || duration < 3) {
          throw new Error('Không đọc được thời lượng video. Vui lòng thử một file khác.')
        }
        setSourceDuration(duration)
        // Forcing an audio codec (or extracting audio) on a video with no audio stream
        // makes ffmpeg fail outright — every audio-only step below is skipped when absent.
        const hasAudio = hasAudioStream(probeLogs)

        // --- Cheap, whole-video analysis passes ---------------------------------------
        const skipSceneDetection = duration > SCENE_DETECTION_MAX_DURATION
        let sceneTimestamps: number[] = []
        if (!skipSceneDetection) {
          const sceneLogs: string[] = []
          await runTracked(
            ffmpeg,
            ['-i', INPUT_NAME, '-vf', "fps=6,scale=256:-2,select='gt(scene,0.35)',showinfo", '-an', '-f', 'null', '-'],
            {
              onLog: (line) => sceneLogs.push(line),
              onProgress: (timeSeconds) =>
                setProgress({
                  stage: 'detecting',
                  label: 'Đang phát hiện chuyển cảnh…',
                  overall: 0.08 + 0.06 * Math.min(1, timeSeconds / duration),
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
            overall: 0.14,
          })
        }

        let silenceRanges: { start: number; end: number }[] = []
        let silenceMidpoints: number[] = []
        let energyCurve: ReturnType<typeof computeEnergyCurve> = []
        let peakRms = 0

        if (hasAudio) {
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
                  overall: 0.14 + 0.06 * Math.min(1, timeSeconds / duration),
                  elapsedSeconds: timeSeconds,
                  totalSeconds: duration,
                }),
            },
          )
          silenceRanges = parseSilenceRanges(silenceLogs)
          silenceMidpoints = silenceRanges.map((r) => (r.start + r.end) / 2)

          setProgress({ stage: 'detecting', label: 'Đang phân tích năng lượng âm thanh…', overall: 0.2 })
          const fullAudioWav = await extractAudioWav(ffmpeg, INPUT_NAME, undefined, undefined, (timeSeconds) =>
            setProgress({
              stage: 'detecting',
              label: 'Đang phân tích năng lượng âm thanh…',
              overall: 0.2 + 0.08 * Math.min(1, timeSeconds / duration),
              elapsedSeconds: timeSeconds,
              totalSeconds: duration,
            }),
          )
          const fullAudioSamples = await decodeWavToFloat32(fullAudioWav)
          energyCurve = computeEnergyCurve(fullAudioSamples, 16000)
          peakRms = overallPeakRms(energyCurve)
        } else {
          setProgress({
            stage: 'detecting',
            label: 'Video không có audio — bỏ qua phân tích giọng nói/âm lượng…',
            overall: 0.2,
          })
        }

        // --- Candidate generation: full chronological decomposition of the video ------
        // An explicit clip count overrides the target-duration heuristic: aim each
        // candidate at roughly duration/clipCount so the video actually splits into that
        // many pieces, instead of just capping how many of the usual-length clips we take.
        const targetClipCount = settings.clipCount && settings.clipCount > 0 ? settings.clipCount : MAX_CLIPS
        const candidateSettings = settings.clipCount && settings.clipCount > 0
          ? {
              ...settings,
              targetDuration: Math.min(
                settings.maxDuration,
                Math.max(settings.minDuration, duration / settings.clipCount),
              ),
            }
          : settings

        const allCandidates: ScoredCandidate[] = buildSegments(
          duration,
          sceneTimestamps,
          silenceMidpoints,
          candidateSettings,
          CANDIDATE_GENERATION_CAP,
        ).map((seg) => ({ ...seg, signals: { hook: 0, sceneDensity: 0, audioEnergy: 0, selfContained: 0.5, deadAir: 0 } }))

        if (allCandidates.length === 0) {
          throw new Error('Video quá ngắn để tạo clip. Vui lòng thử video dài hơn.')
        }

        // --- Tier 1: cheap signals only (no transcript needed) — ranks every candidate -
        for (const candidate of allCandidates) {
          const signals: CandidateSignals = {
            hook: 0,
            sceneDensity: sceneDensityScore(sceneTimestamps, candidate.start, candidate.end),
            audioEnergy: peakEnergyInRange(energyCurve, peakRms, candidate.start, candidate.end),
            selfContained: 0.5,
            deadAir: deadAirRatio(silenceRanges, candidate.start, candidate.end),
          }
          candidate.signals = signals
          candidate.score = combineScore(signals, settings.scoringWeights)
        }

        // --- Tier 2: refine the top pool with real transcript-based signals -----------
        const candidateCuesMap = new Map<string, SubtitleCue[]>()
        let scorePool = allCandidates
        if (settings.generateSubtitles && hasAudio) {
          const poolSize = Math.min(allCandidates.length, targetClipCount * CANDIDATE_POOL_MULTIPLIER)
          const pool = [...allCandidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, poolSize)

          const fontBytes = await getSubtitleFontBytes()
          await ffmpeg.writeFile(SUBTITLE_FONT_FS_NAME, fontBytes)

          for (let i = 0; i < pool.length; i += 1) {
            const candidate = pool[i]
            setProgress({
              stage: 'transcribing',
              label: `Đang phân tích ứng viên ${i + 1}/${pool.length}…`,
              overall: 0.3 + 0.25 * ((i + 1) / pool.length),
            })
            let localCues: SubtitleCue[] = []
            try {
              const wavBytes = await extractAudioWav(ffmpeg, INPUT_NAME, candidate.start, candidate.end)
              const samples = await decodeWavToFloat32(wavBytes)
              localCues = await transcribeAudio(samples, { shouldContinue: () => !cancelledRef.current })
              localCues = localCues.map((cue) => ({
                ...cue,
                start: cue.start + candidate.start,
                end: cue.end + candidate.start,
              }))
            } catch (candidateErr) {
              if (cancelledRef.current) throw candidateErr
              // This one candidate failed to transcribe (e.g. no speech in range) — score
              // it on cheap signals alone instead of aborting the whole selection.
              // eslint-disable-next-line no-console
              console.error('[autocut] candidate transcription failed, scoring without it', candidateErr)
            }

            candidateCuesMap.set(candidate.id, localCues)
            const signals: CandidateSignals = {
              ...candidate.signals,
              hook: hookScore(localCues[0]?.text ?? ''),
              selfContained: selfContainedScore(candidate.start, candidate.end, localCues),
            }
            candidate.signals = signals
            candidate.score = combineScore(signals, settings.scoringWeights)
          }
          scorePool = pool
        }

        // --- Final selection: highest score first, skipping time overlaps -------------
        const ranked = [...scorePool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        const selected: ScoredCandidate[] = []
        for (const candidate of ranked) {
          if (selected.length >= targetClipCount) break
          if (selected.some((s) => segmentsOverlap(s, candidate))) continue
          selected.push(candidate)
        }
        if (selected.length === 0) {
          throw new Error('Không tìm được đoạn phù hợp để cắt clip. Vui lòng thử video khác.')
        }
        selected.sort((a, b) => a.start - b.start)
        const segments: ScoredCandidate[] = selected.map((seg, idx) => ({ ...seg, index: idx }))

        // --- Cut & export the selected clips --------------------------------------------
        const cuttingStart = settings.generateSubtitles ? 0.55 : 0.3

        if (settings.useServerProcessing && isServerConfigured()) {
          setProgress({ stage: 'cutting', label: 'Đang tải video lên server…', overall: cuttingStart })
          const videoUrl = await uploadSourceVideo(file, (fraction) =>
            setProgress({
              stage: 'cutting',
              label: `Đang tải video lên server… ${Math.round(fraction * 100)}%`,
              overall: cuttingStart + 0.15 * fraction,
            }),
          )

          setProgress({
            stage: 'cutting',
            label: `Đang cắt ${segments.length} clip trên server (ffmpeg thật)…`,
            overall: cuttingStart + 0.2,
          })
          const serverSegments: ServerCutSegment[] = segments.map((seg) => ({
            id: seg.id,
            start: seg.start,
            end: seg.end,
            verticalCrop: settings.verticalCrop,
            speed: settings.playbackSpeed,
            cues: settings.generateSubtitles ? candidateCuesMap.get(seg.id) : undefined,
          }))
          const serverClips = await requestCutJob(videoUrl, serverSegments)

          const generated: GeneratedClip[] = segments.map((seg) => {
            const clip = serverClips.find((c) => c.id === seg.id)
            const hasCues = Boolean(settings.generateSubtitles && (candidateCuesMap.get(seg.id)?.length ?? 0) > 0)
            return { ...seg, url: clip?.url ?? '', size: clip?.size ?? 0, hasSubtitles: hasCues }
          })
          setClips(generated)
          await ffmpeg.deleteFile(INPUT_NAME)
          setProgress({ stage: 'done', label: 'Hoàn tất!', overall: 1 })
          return
        }

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
          const cuesForSegment = settings.generateSubtitles ? candidateCuesMap.get(seg.id) ?? [] : []
          const subtitleFilter = settings.generateSubtitles ? buildSubtitleFilter(cuesForSegment, seg.start, seg.end) : ''
          const speed = settings.playbackSpeed
          // setpts must come after the subtitle drawtext filters — they gate on `t`
          // relative to the clip's original timing, so re-timing the stream first would
          // throw their enable='between(t,...)' windows off.
          const vfParts = [baseFilter]
          if (subtitleFilter) vfParts.push(subtitleFilter)
          if (speed !== 1) vfParts.push(`setpts=PTS/${speed}`)
          const vf = vfParts.join(',')
          // Forcing an AAC audio stream on a source with none makes ffmpeg refuse to run.
          // atempo re-times audio to match; it's only valid in [0.5, 2] per instance, which
          // is exactly the slider's range, so a single filter always covers it.
          const audioArgs = hasAudio
            ? [...(speed !== 1 ? ['-af', `atempo=${speed}`] : []), '-c:a', 'aac', '-b:a', '128k']
            : ['-an']
          const outputDuration = segDuration / speed

          await runTracked(
            ffmpeg,
            [
              '-ss', String(seg.start),
              '-to', String(seg.end),
              '-i', INPUT_NAME,
              '-vf', vf,
              '-c:v', 'libx264',
              '-preset', ENCODE_PRESET_MAP[settings.encodeSpeed],
              '-crf', '26',
              ...audioArgs,
              outName,
            ],
            {
              onProgress: (timeSeconds) =>
                setProgress({
                  stage: 'cutting',
                  label: `Đang cắt clip ${i + 1}/${segments.length}…`,
                  overall: clipBaseOverall + clipSlice * Math.min(1, timeSeconds / Math.max(outputDuration, 1)),
                  currentClip: i + 1,
                  totalClips: segments.length,
                }),
              // Safety net against a runaway filter graph (e.g. too many chained subtitle
              // filters) — bail out with a clear error instead of hanging indefinitely.
              timeoutMs: Math.max(60_000, segDuration * 8_000),
              checkExitCode: true,
            },
          )

          const data = await ffmpeg.readFile(outName)
          const bytes = data as Uint8Array
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })
          const url = URL.createObjectURL(blob)
          clipUrlsRef.current.push(url)
          generated.push({ ...seg, url, size: blob.size, hasSubtitles: Boolean(subtitleFilter) })
          // Show each clip as soon as it's ready instead of making the user wait for the
          // whole batch — they can already preview/download it while the rest keep cutting.
          setClips([...generated])
          await ffmpeg.deleteFile(outName)
        }

        await ffmpeg.deleteFile(INPUT_NAME)
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
