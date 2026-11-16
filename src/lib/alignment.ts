/**
 * Offline word-timing engine.
 *
 *  1. alignByEnergy      – text + audio, no model needed. Voice-activity detection on the
 *                          recitation, ayah boundaries snapped to the longest pauses, words
 *                          distributed over voiced time by spoken weight and snapped to pauses.
 *  2. alignWithRecognized – text + whisper word timestamps. Needleman–Wunsch alignment of the
 *                          user's exact text to recognised words (diacritics-insensitive), then
 *                          interpolation for any unmatched words. The user's text is never changed.
 *  3. wordsFromRecognized – audio only (whisper output becomes the text, flagged for verification).
 */
import { normalizeForMatch, spokenWeight } from './arabic'

export const HOP = 0.01 // 10 ms analysis frames

export interface Timed {
  start: number
  end: number
}

export function computeEnergy(buffer: AudioBuffer): Float32Array {
  const sr = buffer.sampleRate
  const hop = Math.round(sr * HOP)
  const frames = Math.ceil(buffer.length / hop)
  const out = new Float32Array(frames)
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const s0 = f * hop
    const s1 = Math.min(buffer.length, s0 + hop)
    for (let s = s0; s < s1; s++) {
      let v = 0
      for (const c of chans) v += c[s]
      v /= chans.length
      sum += v * v
    }
    out[f] = Math.sqrt(sum / Math.max(1, s1 - s0))
  }
  // light smoothing (50 ms)
  const sm = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let acc = 0
    let n = 0
    for (let k = -2; k <= 2; k++) {
      const j = i + k
      if (j >= 0 && j < frames) {
        acc += out[j]
        n++
      }
    }
    sm[i] = acc / n
  }
  return sm
}

export function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const data = buffer.getChannelData(0)
  const step = Math.max(1, Math.floor(data.length / buckets))
  const peaks = new Float32Array(buckets)
  for (let i = 0; i < buckets; i++) {
    let max = 0
    const s0 = i * step
    for (let s = s0; s < s0 + step && s < data.length; s += 4) {
      const v = Math.abs(data[s])
      if (v > max) max = v
    }
    peaks[i] = max
  }
  return peaks
}

/** Voiced regions within [t0, t1]. */
export function detectVoiced(energy: Float32Array, t0: number, t1: number): Timed[] {
  const f0 = Math.max(0, Math.floor(t0 / HOP))
  const f1 = Math.min(energy.length, Math.ceil(t1 / HOP))
  const slice = Array.from(energy.subarray(f0, f1)).sort((a, b) => a - b)
  if (!slice.length) return []
  const noise = slice[Math.floor(slice.length * 0.1)]
  const peak = slice[Math.floor(slice.length * 0.98)]
  const thr = noise + (peak - noise) * 0.12
  const minSilence = Math.round(0.16 / HOP)
  const minVoiced = Math.round(0.08 / HOP)

  const regions: Timed[] = []
  let inVoice = false
  let start = f0
  let silentRun = 0
  for (let f = f0; f < f1; f++) {
    const voiced = energy[f] > thr
    if (voiced) {
      if (!inVoice) {
        inVoice = true
        start = f
      }
      silentRun = 0
    } else if (inVoice) {
      silentRun++
      if (silentRun >= minSilence) {
        const end = f - silentRun + 1
        if (end - start >= minVoiced) regions.push({ start: start * HOP, end: end * HOP })
        inVoice = false
        silentRun = 0
      }
    }
  }
  if (inVoice && f1 - start >= minVoiced) regions.push({ start: start * HOP, end: f1 * HOP })
  return regions
}

/** Map a fraction of total voiced time to an absolute time. */
function voicedTimeAt(regions: Timed[], fraction: number) {
  const total = regions.reduce((a, r) => a + (r.end - r.start), 0)
  let target = fraction * total
  for (const r of regions) {
    const len = r.end - r.start
    if (target <= len) return r.start + target
    target -= len
  }
  return regions.length ? regions[regions.length - 1].end : 0
}

function nearestGap(gaps: Array<{ at: number; len: number }>, t: number, tolerance: number, minLen = 0) {
  let best: { at: number; len: number } | null = null
  let bestScore = Infinity
  for (const g of gaps) {
    if (g.len < minLen) continue
    const d = Math.abs(g.at - t)
    if (d > tolerance) continue
    const score = d / tolerance - g.len * 0.8 // prefer close + long pauses
    if (score < bestScore) {
      bestScore = score
      best = g
    }
  }
  return best
}

function gapsOf(regions: Timed[]) {
  const gaps: Array<{ at: number; len: number; from: number; to: number }> = []
  for (let i = 1; i < regions.length; i++) {
    const from = regions[i - 1].end
    const to = regions[i].start
    gaps.push({ at: (from + to) / 2, len: to - from, from, to })
  }
  return gaps
}

function distributeWords(words: string[], regions: Timed[], start: number, end: number): Timed[] {
  const local = regions
    .map((r) => ({ start: Math.max(r.start, start), end: Math.min(r.end, end) }))
    .filter((r) => r.end - r.start > 0.02)
  const voiced = local.length ? local : [{ start, end }]
  const weights = words.map(spokenWeight)
  const total = weights.reduce((a, b) => a + b, 0)
  const gaps = gapsOf(voiced)
  let acc = 0
  const bounds: number[] = [voiced[0].start]
  for (let i = 0; i < words.length - 1; i++) {
    acc += weights[i]
    let t = voicedTimeAt(voiced, acc / total)
    const g = nearestGap(gaps, t, 0.3)
    if (g && g.at > bounds[bounds.length - 1] + 0.05) t = g.at
    bounds.push(Math.max(t, bounds[bounds.length - 1] + 0.05))
  }
  bounds.push(voiced[voiced.length - 1].end)
  return words.map((_, i) => {
    let s = bounds[i]
    let e = bounds[i + 1]
    // tighten to voiced edges when the boundary sits inside a pause
    for (const g of gaps) {
      if (s > g.from - 0.001 && s < g.to) s = g.to
      if (e > g.from && e < g.to + 0.001) e = g.from
    }
    if (e <= s) e = s + 0.08
    return { start: +s.toFixed(3), end: +e.toFixed(3) }
  })
}

/**
 * Align ayahs (arrays of words) to the audio using energy only.
 * `ayahBounds` (optional) pins each ayah to a known time span (e.g. concatenated per-ayah audio).
 */
export function alignByEnergy(ayahs: string[][], energy: Float32Array, t0: number, t1: number, ayahBounds?: Timed[]): Timed[][] {
  const regions = detectVoiced(energy, t0, t1)
  const speechStart = regions[0]?.start ?? t0
  const speechEnd = regions[regions.length - 1]?.end ?? t1

  let spans: Timed[]
  if (ayahBounds && ayahBounds.length === ayahs.length) spans = ayahBounds
  else {
    const weights = ayahs.map((a) => a.reduce((s, w) => s + spokenWeight(w), 0))
    const total = weights.reduce((a, b) => a + b, 0)
    const gaps = gapsOf(regions)
    const cuts: number[] = []
    let acc = 0
    for (let i = 0; i < ayahs.length - 1; i++) {
      acc += weights[i]
      const est = voicedTimeAt(regions.length ? regions : [{ start: t0, end: t1 }], acc / total)
      const ayahDur = ((weights[i] / total) * (speechEnd - speechStart)) || 1
      const g = nearestGap(gaps, est, Math.max(0.6, ayahDur * 0.35), 0.25)
      cuts.push(g ? g.at : est)
    }
    const edges = [speechStart, ...cuts, speechEnd]
    spans = ayahs.map((_, i) => ({ start: edges[i], end: edges[i + 1] }))
  }
  return ayahs.map((words, i) => distributeWords(words, regions, spans[i].start, spans[i].end))
}

/* ------------------------------------------------------------------ */

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

function similarity(a: string, b: string) {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (!na || !nb) return 0
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length)
}

/** Needleman–Wunsch alignment of exact text words to recognised words. */
export function alignWithRecognized(textWords: string[], recognized: Array<{ text: string; start: number; end: number }>): Timed[] {
  const n = textWords.length
  const m = recognized.length
  const GAP = -0.45
  const score: Float32Array[] = Array.from({ length: n + 1 }, () => new Float32Array(m + 1))
  const move: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)) // 1 diag, 2 up, 3 left
  for (let i = 1; i <= n; i++) {
    score[i][0] = i * GAP
    move[i][0] = 2
  }
  for (let j = 1; j <= m; j++) {
    score[0][j] = j * GAP
    move[0][j] = 3
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(textWords[i - 1], recognized[j - 1].text)
      const diag = score[i - 1][j - 1] + (sim * 2 - 0.8)
      const up = score[i - 1][j] + GAP
      const left = score[i][j - 1] + GAP
      if (diag >= up && diag >= left) {
        score[i][j] = diag
        move[i][j] = 1
      } else if (up >= left) {
        score[i][j] = up
        move[i][j] = 2
      } else {
        score[i][j] = left
        move[i][j] = 3
      }
    }
  }
  const result: Array<Timed | null> = new Array(n).fill(null)
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const mv = move[i][j]
    if (mv === 1) {
      const r = recognized[j - 1]
      result[i - 1] = { start: r.start, end: r.end }
      i--
      j--
    } else if (mv === 2) i--
    else j--
  }
  // merge: several text words mapped to nothing between anchors → interpolate
  const firstT = recognized[0]?.start ?? 0
  const lastT = recognized[m - 1]?.end ?? n * 0.6
  let k = 0
  while (k < n) {
    if (result[k]) {
      k++
      continue
    }
    let e = k
    while (e < n && !result[e]) e++
    const from = k > 0 ? result[k - 1]!.end : firstT
    const to = e < n ? result[e]!.start : lastT
    const span = Math.max(0.1 * (e - k), to - from)
    const weights = textWords.slice(k, e).map(spokenWeight)
    const tot = weights.reduce((a, b) => a + b, 0)
    let t = from
    for (let q = k; q < e; q++) {
      const d = (weights[q - k] / tot) * span
      result[q] = { start: +t.toFixed(3), end: +(t + d).toFixed(3) }
      t += d
    }
    k = e
  }
  // guarantee monotonic, non-overlapping timings
  const out = result as Timed[]
  for (let q = 1; q < n; q++) {
    if (out[q].start < out[q - 1].end) out[q].start = out[q - 1].end
    if (out[q].end <= out[q].start) out[q].end = out[q].start + 0.08
  }
  return out
}

/** Use whisper output directly as text, splitting ayahs at long pauses. */
export function wordsFromRecognized(recognized: Array<{ text: string; start: number; end: number }>): Array<{ text: string; start: number; end: number; ayahIndex: number }> {
  let ayah = 0
  return recognized.map((w, i) => {
    if (i > 0 && w.start - recognized[i - 1].end > 0.9) ayah++
    return { text: w.text.replace(/[.,،؟?!]/g, ''), start: w.start, end: w.end, ayahIndex: ayah }
  })
}
