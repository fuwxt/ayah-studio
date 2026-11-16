/**
 * Preview audio engine: HTMLAudioElement for playback (volume, rate, mute),
 * Web Audio for decoding (waveform peaks + energy for alignment).
 * Works without audio too, using a virtual clock so text-only projects can be previewed.
 */
import type { AudioSettings } from '../lib/types'
import { computeEnergy, computePeaks } from '../lib/alignment'

class AudioEngine {
  readonly el = new Audio()
  private ctx: AudioContext | null = null
  buffer: AudioBuffer | null = null
  energy: Float32Array | null = null
  peaks: Float32Array | null = null
  private url: string | null = null
  private virtualStart = 0
  private virtualOffset = 0
  private virtualPlaying = false
  fallbackDuration = 10
  settings: AudioSettings | null = null

  constructor() {
    this.el.preload = 'auto'
  }

  get hasAudio() {
    return !!this.buffer
  }

  context() {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  async load(data: Uint8Array | ArrayBuffer, mime = 'audio/mpeg') {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const copy = bytes.slice().buffer
    const buffer = await this.context().decodeAudioData(copy)
    this.setBuffer(buffer, new Blob([bytes.slice()], { type: mime }))
    return buffer
  }

  setBuffer(buffer: AudioBuffer, blob: Blob) {
    this.pause()
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = URL.createObjectURL(blob)
    this.el.src = this.url
    this.buffer = buffer
    this.energy = computeEnergy(buffer)
    this.peaks = computePeaks(buffer, Math.min(40000, Math.ceil(buffer.duration * 200)))
  }

  clear() {
    this.pause()
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    this.el.removeAttribute('src')
    this.buffer = this.energy = this.peaks = null
  }

  get duration() {
    return this.buffer ? this.buffer.duration : this.fallbackDuration
  }

  get playing() {
    return this.hasAudio ? !this.el.paused : this.virtualPlaying
  }

  get time() {
    if (this.hasAudio) return this.el.currentTime
    if (!this.virtualPlaying) return this.virtualOffset
    return this.virtualOffset + ((performance.now() - this.virtualStart) / 1000) * (this.settings?.rate ?? 1)
  }

  range() {
    const s = this.settings
    const start = s?.trimStart ?? 0
    const end = s?.trimEnd && s.trimEnd > start ? Math.min(s.trimEnd, this.duration) : this.duration
    return { start, end }
  }

  async play() {
    const { start, end } = this.range()
    if (this.time < start || this.time >= end - 0.02) this.seek(start)
    if (this.hasAudio) {
      this.el.playbackRate = this.settings?.rate ?? 1
      await this.el.play().catch(() => {})
    } else {
      this.virtualStart = performance.now()
      this.virtualPlaying = true
    }
  }

  pause() {
    if (this.hasAudio) this.el.pause()
    else if (this.virtualPlaying) {
      this.virtualOffset = this.time
      this.virtualPlaying = false
    }
  }

  seek(t: number) {
    const clamped = Math.max(0, Math.min(this.duration, t))
    if (this.hasAudio) this.el.currentTime = clamped
    else {
      this.virtualOffset = clamped
      this.virtualStart = performance.now()
    }
  }

  /** Called every animation frame: applies volume/fades and stops at the trim end. */
  tick() {
    const s = this.settings
    const t = this.time
    const { start, end } = this.range()
    if (this.playing && t >= end) {
      this.pause()
      this.seek(end)
    }
    if (this.hasAudio && s) {
      let gain = s.muted ? 0 : s.volume
      if (s.fadeIn > 0) gain *= Math.min(1, Math.max(0, (t - start) / s.fadeIn))
      if (s.fadeOut > 0) gain *= Math.min(1, Math.max(0, (end - t) / s.fadeOut))
      this.el.volume = Math.max(0, Math.min(1, gain))
      if (Math.abs(this.el.playbackRate - s.rate) > 0.001) this.el.playbackRate = s.rate
    }
    return t
  }
}

export const audioEngine = new AudioEngine()
