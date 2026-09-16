import type { SilenceRange } from './ffmpeg'

export interface EnergyPoint {
  time: number
  rms: number
}

const WINDOW_SECONDS = 0.5

/** Windowed RMS loudness curve — a cheap, no-AI proxy for "how energetic/loud is this moment". */
export function computeEnergyCurve(samples: Float32Array, sampleRate: number): EnergyPoint[] {
  const windowSize = Math.max(1, Math.round(WINDOW_SECONDS * sampleRate))
  const curve: EnergyPoint[] = []
  for (let i = 0; i < samples.length; i += windowSize) {
    const end = Math.min(samples.length, i + windowSize)
    let sumSquares = 0
    for (let j = i; j < end; j += 1) sumSquares += samples[j] * samples[j]
    const rms = Math.sqrt(sumSquares / Math.max(1, end - i))
    curve.push({ time: i / sampleRate, rms })
  }
  return curve
}

/** Peak RMS within [start, end), normalized 0-1 against the curve's overall peak. */
export function peakEnergyInRange(curve: EnergyPoint[], overallPeakRms: number, start: number, end: number): number {
  if (overallPeakRms <= 0) return 0
  let peak = 0
  for (const point of curve) {
    if (point.time < start) continue
    if (point.time >= end) break
    if (point.rms > peak) peak = point.rms
  }
  return Math.min(1, peak / overallPeakRms)
}

export function overallPeakRms(curve: EnergyPoint[]): number {
  let peak = 0
  for (const point of curve) if (point.rms > peak) peak = point.rms
  return peak
}

/** Fraction of [start, end) covered by silence ranges — 0 (no dead air) to 1 (all silent). */
export function deadAirRatio(silenceRanges: SilenceRange[], start: number, end: number): number {
  const segDuration = end - start
  if (segDuration <= 0) return 0
  let silentSeconds = 0
  for (const range of silenceRanges) {
    const overlapStart = Math.max(start, range.start)
    const overlapEnd = Math.min(end, range.end)
    if (overlapEnd > overlapStart) silentSeconds += overlapEnd - overlapStart
  }
  return Math.min(1, silentSeconds / segDuration)
}
