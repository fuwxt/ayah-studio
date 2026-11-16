/**
 * Frame-accurate offline export. Every frame is rendered deterministically at time
 * t = start + i / fps (never screen-recorded), read back as RGBA and streamed to FFmpeg
 * in the main process, which encodes it and muxes the recitation audio.
 */
import type { ProjectDoc } from '../lib/types'
import { desktop, type ExportStartOptions } from '../lib/bridge'
import { StudioRenderer } from './renderer'
import { audioEngine } from './audio'

export interface ExportSpec {
  label: string
  width: number
  height: number
  fps: number
  format: ExportStartOptions['format']
  codec: ExportStartOptions['codec']
  quality: number
  hardware: 'auto' | 'cpu'
  withAudio: boolean
}

export interface ExportProgress {
  label: string
  frame: number
  frames: number
  eta: number
  encoder?: string
}

export function exportRange(doc: ProjectDoc) {
  if (audioEngine.hasAudio) return audioEngine.range()
  const last = doc.words.reduce((m, w) => Math.max(m, w.end), 0)
  return { start: 0, end: Math.max(3, last + 1.5) }
}

async function prepareVideo(src: HTMLVideoElement | null) {
  if (!src) return null
  const v = document.createElement('video')
  v.src = src.src
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve()
    v.onerror = () => reject(new Error('Could not load background video for export'))
  })
  return v
}

function seekVideo(v: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    const target = v.duration ? t % v.duration : 0
    if (Math.abs(v.currentTime - target) < 0.001) return resolve()
    v.onseeked = () => resolve()
    v.currentTime = target
  })
}

export async function runExport(
  doc: ProjectDoc,
  spec: ExportSpec,
  opts: { audioPath?: string; bg?: HTMLImageElement | HTMLVideoElement | null; isCancelled: () => boolean; onProgress: (p: ExportProgress) => void },
): Promise<string | null> {
  if (!desktop) throw new Error('Video export runs in the desktop app (FFmpeg is bundled there).')
  const { start, end } = exportRange(doc)
  const duration = Math.max(0.1, end - start)
  const frames = Math.ceil(duration * spec.fps)

  const canvas = document.createElement('canvas')
  const renderer = new StudioRenderer(canvas)
  renderer.setSize(spec.width, spec.height)
  const video = opts.bg instanceof HTMLVideoElement ? await prepareVideo(opts.bg) : null
  const media = { bg: video ?? opts.bg ?? null }
  const exportDoc: ProjectDoc = { ...doc, canvas: { ...doc.canvas, width: spec.width, height: spec.height } }

  const job = await desktop.exportStart({
    width: spec.width,
    height: spec.height,
    fps: spec.fps,
    duration,
    format: spec.format,
    codec: spec.codec,
    quality: spec.quality,
    hardware: spec.hardware,
    withAudio: spec.withAudio && !!opts.audioPath,
    audioPath: opts.audioPath,
    audioStart: start,
    audioFadeIn: doc.audio.fadeIn,
    audioFadeOut: doc.audio.fadeOut,
    fileBase: `${doc.name}_${spec.label.replace(':', 'x')}`,
  })

  const buf = new Uint8Array(spec.width * spec.height * 4)
  const t0 = performance.now()
  try {
    for (let i = 0; i < frames; i++) {
      if (opts.isCancelled()) {
        await desktop.exportCancel(job.id)
        return null
      }
      const t = start + i / spec.fps
      if (video) await seekVideo(video, t - start)
      renderer.render(exportDoc, t, media, t)
      renderer.readPixels(buf)
      await desktop.exportFrame(job.id, buf)
      if (i % 3 === 0 || i === frames - 1) {
        const elapsed = (performance.now() - t0) / 1000
        opts.onProgress({ label: spec.label, frame: i + 1, frames, eta: (elapsed / (i + 1)) * (frames - i - 1), encoder: job.encoder })
      }
    }
    return await desktop.exportFinish(job.id)
  } catch (e) {
    await desktop.exportCancel(job.id).catch(() => {})
    throw e
  } finally {
    renderer.dispose()
  }
}

/** Render one still frame at full output resolution (thumbnail). */
export async function renderStill(doc: ProjectDoc, t: number, bg: HTMLImageElement | HTMLVideoElement | null) {
  const canvas = document.createElement('canvas')
  const renderer = new StudioRenderer(canvas)
  renderer.setSize(doc.canvas.width, doc.canvas.height)
  renderer.render(doc, t, { bg }, t)
  const blob = await renderer.toPngBlob()
  renderer.dispose()
  return blob
}
