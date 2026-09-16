import type { ScoringWeights, SubtitleCue } from '../types'

// Simple bilingual (VN/EN) heuristic — no AI needed, just pattern-matching the opening
// line of a candidate against traits that make a strong short-form hook.
const HOOK_KEYWORDS = [
  'bí quyết', 'sự thật', 'không ngờ', 'tuyệt đối', 'nhất', 'lần đầu', 'cảnh báo',
  'secret', 'truth', 'never', 'always', 'biggest', 'worst', 'best', 'nobody tells you',
  'here’s why', 'this is why', 'warning',
]

/** Scores how strong a candidate's opening line is as a short-form hook (0-1). */
export function hookScore(openingText: string): number {
  const text = openingText.trim()
  if (!text) return 0

  let score = 0
  if (text.includes('?')) score += 0.3
  if (/\d/.test(text)) score += 0.2
  if (text.includes('!')) score += 0.15
  const lower = text.toLowerCase()
  if (HOOK_KEYWORDS.some((kw) => lower.includes(kw))) score += 0.35

  const wordCount = text.split(/\s+/).filter(Boolean).length
  if (wordCount < 3) score -= 0.2
  // Starting with a lowercase letter usually means the clip opens mid-sentence.
  if (/^[a-zà-ỹ]/.test(text)) score -= 0.3

  return Math.max(0, Math.min(1, score))
}

/** How closely a segment's boundaries land on real sentence boundaries instead of mid-word (0-1). */
export function selfContainedScore(segStart: number, segEnd: number, cues: SubtitleCue[]): number {
  if (cues.length === 0) return 0.5 // no transcript signal available — stay neutral
  const TOLERANCE = 0.4
  const startsOnCue = cues.some((cue) => Math.abs(cue.start - segStart) <= TOLERANCE)
  const endsOnCue = cues.some((cue) => Math.abs(cue.end - segEnd) <= TOLERANCE)
  if (startsOnCue && endsOnCue) return 1
  if (startsOnCue || endsOnCue) return 0.5
  return 0
}

/** Scene-change density within [start, end), normalized against ~1 cut per 3s as "very dynamic" (0-1). */
export function sceneDensityScore(sceneTimestamps: number[], start: number, end: number): number {
  const duration = end - start
  if (duration <= 0) return 0
  const count = sceneTimestamps.filter((t) => t >= start && t < end).length
  const density = count / duration
  return Math.min(1, density / (1 / 3))
}

export interface CandidateSignals {
  hook: number
  sceneDensity: number
  audioEnergy: number
  selfContained: number
  deadAir: number
}

/** Combines the individual 0-1 signals into one weighted score. Weights are user-configurable. */
export function combineScore(signals: CandidateSignals, weights: ScoringWeights): number {
  const raw =
    weights.hook * signals.hook +
    weights.sceneDensity * signals.sceneDensity +
    weights.audioEnergy * signals.audioEnergy +
    weights.selfContained * signals.selfContained -
    weights.deadAir * signals.deadAir
  return Math.max(0, raw)
}
