import type { ClipReason, ClipSegment, SplitSettings } from '../types'

interface Candidate {
  time: number
  reason: ClipReason
}

export const MAX_CLIPS = 12
const TAIL_MERGE_THRESHOLD = 6

/**
 * Greedy rule-based splitter: walks forward from 0, and at each step prefers a
 * detected scene-change or silence-gap candidate close to the target duration
 * (snap window) over a hard cut, so clips don't end mid-sentence when possible.
 *
 * `cap` limits how many segments to return — pass a high number to get a full
 * chronological decomposition of the video as a candidate pool for scoring,
 * instead of the final (small) clip count.
 */
export function buildSegments(
  duration: number,
  sceneTimestamps: number[],
  silenceMidpoints: number[],
  settings: SplitSettings,
  cap: number = MAX_CLIPS,
): ClipSegment[] {
  const { targetDuration, minDuration, maxDuration } = settings
  const snapWindow = Math.min(8, targetDuration * 0.3)

  const candidates: Candidate[] = [
    ...sceneTimestamps.map((time) => ({ time, reason: 'scene' as const })),
    ...silenceMidpoints.map((time) => ({ time, reason: 'silence' as const })),
  ]
    .filter((c) => c.time > 0 && c.time < duration)
    .sort((a, b) => a.time - b.time)

  const segments: ClipSegment[] = []
  let cursor = 0
  let index = 0

  while (cursor < duration - 0.5 && segments.length < cap) {
    const idealEnd = cursor + targetDuration
    const hardMax = Math.min(cursor + maxDuration, duration)

    let best: Candidate | null = null
    let bestDelta = Infinity
    for (const c of candidates) {
      if (c.time <= cursor + minDuration) continue
      if (c.time > hardMax) break
      const delta = Math.abs(c.time - idealEnd)
      if (delta <= snapWindow && delta < bestDelta) {
        best = c
        bestDelta = delta
      }
    }

    let end: number
    let reason: ClipReason
    if (best) {
      end = best.time
      reason = best.reason
    } else {
      end = Math.min(idealEnd, hardMax)
      reason = 'fixed'
    }
    end = Math.min(end, duration)

    const remaining = duration - end
    if (remaining > 0 && remaining < TAIL_MERGE_THRESHOLD) {
      end = duration
    }

    segments.push({
      id: `clip-${index}`,
      index,
      start: cursor,
      end,
      reason,
    })

    cursor = end
    index += 1
  }

  return segments
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}
