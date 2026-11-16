export interface Word {
  id: string
  text: string
  start: number
  end: number
  ayahIndex: number
  /** Per-word overrides (undefined = use theme colours). */
  color?: string
  glowColor?: string
}

export interface Ayah {
  id: string
  surah?: number
  ayah?: number
  translation?: string
}

export interface Theme {
  name: string
  background: string
  background2: string
  text: string
  pending: string
  highlight: string
  spoken: string
  glow: string
  translation: string
  rainTint: string
}

export type AnimationPreset = 'none' | 'fade' | 'rise' | 'blur' | 'pop' | 'float' | 'pulse'
export type Easing = 'linear' | 'easeOut' | 'easeInOut' | 'expoOut'

export interface TextStyle {
  arabicFont: string
  arabicSize: number // px at a 1080px short side
  arabicWeight: number
  lineHeight: number
  wordSpacing: number
  maxWidth: number // fraction of canvas width
  maxLines: number
  align: 'center' | 'right' | 'left'
  verticalPosition: number // 0 top .. 1 bottom (centre of text block)
  revealMode: 'all' | 'progressive'
  pendingOpacity: number
  showAyahNumber: boolean
  animation: {
    preset: AnimationPreset
    duration: number
    easing: Easing
    intensity: number
  }
  translation: {
    enabled: boolean
    font: string
    size: number
    weight: number
    lineHeight: number
    maxWidth: number
    gap: number
    direction: 'auto' | 'ltr' | 'rtl'
  }
}

export interface GlowSettings {
  enabled: boolean
  threshold: number
  radius: number
  intensity: number
  falloff: number
  activeBoost: number
  idleGlow: number
  chromatic: number
  glowOnly: boolean
}

export interface RainSettings {
  enabled: boolean
  density: number
  size: number
  speed: number
  fog: number
  refraction: number
  refractText: boolean
}

export interface BackgroundSettings {
  type: 'solid' | 'gradient' | 'image' | 'video'
  angle: number
  dim: number
  mediaName?: string
}

export interface CanvasSettings {
  ratio: string
  width: number
  height: number
  safeGuides: boolean
}

export interface AudioSettings {
  volume: number
  muted: boolean
  trimStart: number
  trimEnd: number // 0 = until end
  fadeIn: number
  fadeOut: number
  rate: number
}

export interface ProjectDoc {
  name: string
  words: Word[]
  ayahs: Ayah[]
  theme: Theme
  style: TextStyle
  glow: GlowSettings
  rain: RainSettings
  background: BackgroundSettings
  canvas: CanvasSettings
  audio: AudioSettings
  meta: {
    surahName?: string
    reciter?: string
    source: 'manual' | 'whisper' | 'online' | 'none'
    needsVerification?: boolean
  }
  audioRel?: string
  backgroundRel?: string
}
