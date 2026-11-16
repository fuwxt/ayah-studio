import type { ProjectDoc, Theme } from './types'

export const BUILT_IN_THEMES: Theme[] = [
  { name: 'Pure Black · Gold', background: '#000000', background2: '#0d0a05', text: '#f5ead2', pending: '#6b6253', highlight: '#ffd27a', spoken: '#f5ead2', glow: '#ffb84d', translation: '#cfc6b2', rainTint: '#a99c84' },
  { name: 'Burgundy · Cream', background: '#4a0f1c', background2: '#2a0710', text: '#f3e6cf', pending: '#a5838a', highlight: '#fff4dc', spoken: '#f3e6cf', glow: '#ffd9a8', translation: '#e8d3c0', rainTint: '#c99aa3' },
  { name: 'Cream · Dark Green', background: '#f1e8d4', background2: '#e2d5b9', text: '#123d2c', pending: '#9aa898', highlight: '#0b5c3a', spoken: '#123d2c', glow: '#2f9e6a', translation: '#355a48', rainTint: '#d8ccb2' },
  { name: 'Midnight · Cyan', background: '#070f24', background2: '#0f1f45', text: '#dff6ff', pending: '#4c5f80', highlight: '#9eeaff', spoken: '#dff6ff', glow: '#4fd8ff', translation: '#a9c4d8', rainTint: '#6d8bb3' },
  { name: 'Emerald · Cream', background: '#0d3b2e', background2: '#06241b', text: '#f4ead3', pending: '#6f8e80', highlight: '#fff6de', spoken: '#f4ead3', glow: '#e6c98a', translation: '#d6d0b8', rainTint: '#6c9c8a' },
  { name: 'Charcoal · Amber', background: '#1b1c1e', background2: '#0e0e0f', text: '#f1ece4', pending: '#5f5b55', highlight: '#ffbf66', spoken: '#f1ece4', glow: '#ff9a2e', translation: '#c2bbb0', rainTint: '#8a847b' },
  { name: 'Pure Black · White', background: '#000000', background2: '#050505', text: '#ffffff', pending: '#555555', highlight: '#ffffff', spoken: '#e8e8e8', glow: '#ffffff', translation: '#bdbdbd', rainTint: '#9a9a9a' },
]

export interface RatioPreset {
  id: string
  label: string
  w: number
  h: number
  hint?: string
}

export const RATIOS: RatioPreset[] = [
  { id: '9:16', label: '9:16', w: 9, h: 16, hint: 'TikTok · Reels · Shorts' },
  { id: '1:1', label: '1:1', w: 1, h: 1, hint: 'Instagram / Facebook post' },
  { id: '4:5', label: '4:5', w: 4, h: 5, hint: 'Instagram feed' },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '16:9', label: '16:9', w: 16, h: 9, hint: 'YouTube' },
  { id: '21:9', label: '21:9', w: 21, h: 9, hint: 'Cinematic' },
]

export const RESOLUTIONS = [
  { id: '720p', short: 720 },
  { id: '1080p', short: 1080 },
  { id: '2K', short: 1440 },
  { id: '4K', short: 2160 },
] as const

/** Size for a ratio at a given short-side resolution, rounded to even numbers (required by H.264). */
export function sizeFor(ratioW: number, ratioH: number, short: number) {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  if (ratioW <= ratioH) return { width: even(short), height: even((short * ratioH) / ratioW) }
  return { width: even((short * ratioW) / ratioH), height: even(short) }
}

export const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', ratio: '9:16', fps: 30, url: 'https://www.tiktok.com/tiktokstudio/upload' },
  { id: 'instagram', name: 'Instagram Reels', ratio: '9:16', fps: 30, url: 'https://www.instagram.com/' },
  { id: 'facebook', name: 'Facebook Reels', ratio: '9:16', fps: 30, url: 'https://www.facebook.com/reels/create' },
  { id: 'youtube', name: 'YouTube Shorts', ratio: '9:16', fps: 30, url: 'https://studio.youtube.com/' },
] as const

export function defaultDoc(): ProjectDoc {
  return {
    name: 'Untitled Recitation',
    words: [],
    ayahs: [],
    theme: { ...BUILT_IN_THEMES[0] },
    style: {
      arabicFont: 'Amiri Quran',
      arabicSize: 92,
      arabicWeight: 400,
      lineHeight: 1.9,
      wordSpacing: 0.32,
      maxWidth: 0.84,
      maxLines: 4,
      align: 'center',
      verticalPosition: 0.48,
      revealMode: 'all',
      pendingOpacity: 0.55,
      showAyahNumber: true,
      animation: { preset: 'rise', duration: 0.6, easing: 'expoOut', intensity: 0.5 },
      translation: {
        enabled: true,
        font: 'Inter Variable',
        size: 34,
        weight: 400,
        lineHeight: 1.5,
        maxWidth: 0.8,
        gap: 56,
        direction: 'auto',
      },
    },
    glow: { enabled: true, threshold: 0.05, radius: 0.6, intensity: 1.1, falloff: 0.55, activeBoost: 1, idleGlow: 0.18, chromatic: 0, glowOnly: false },
    rain: { enabled: false, density: 0.5, size: 0.5, speed: 0.4, fog: 0.5, refraction: 0.6, refractText: false },
    background: { type: 'solid', angle: 160, dim: 0.35 },
    canvas: { ratio: '9:16', width: 1080, height: 1920, safeGuides: false },
    audio: { volume: 1, muted: false, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0.6, rate: 1 },
    meta: { source: 'none' },
  }
}
