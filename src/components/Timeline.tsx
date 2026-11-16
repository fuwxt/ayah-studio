import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, ChevronsLeft, ChevronsRight, Play, Maximize2 } from 'lucide-react'
import { useStudio } from '../lib/store'
import { audioEngine } from '../engine/audio'
import { Button, cn } from './ui'

const RULER_H = 22
const WAVE_H = 56
const LANE_H = 46

export function Timeline() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState({ left: 0, width: 800 })
  const words = useStudio((s) => s.doc.words)
  const selection = useStudio((s) => s.selection)
  const time = useStudio((s) => s.time)
  const playing = useStudio((s) => s.playing)
  const zoom = useStudio((s) => s.timelineZoom)
  const audioInfo = useStudio((s) => s.audioInfo)
  const trimStart = useStudio((s) => s.doc.audio.trimStart)
  const trimEnd = useStudio((s) => s.doc.audio.trimEnd)
  const arabicFont = useStudio((s) => s.doc.style.arabicFont)
  const set = useStudio((s) => s.set)

  const duration = useMemo(() => Math.max(audioInfo?.duration ?? 0, words.reduce((m, w) => Math.max(m, w.end), 0) + 2, 5), [audioInfo, words])
  const totalW = Math.ceil(duration * zoom) + 40
  const selSet = useMemo(() => new Set(selection), [selection])

  // track scroll position + viewport width
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setView({ left: el.scrollLeft, width: el.clientWidth }))
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // follow the playhead while playing
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = time * zoom
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.25)
  }, [time, playing, zoom])

  // waveform (only the visible slice is drawn)
  useEffect(() => {
    const c = waveRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, view.width * dpr)
    c.height = WAVE_H * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, view.width, WAVE_H)
    const peaks = audioEngine.peaks
    if (!peaks || !audioInfo) return
    const css = getComputedStyle(document.documentElement)
    ctx.fillStyle = css.getPropertyValue('--muted-foreground').trim() || '#888'
    const mid = WAVE_H / 2
    const perSec = peaks.length / audioInfo.duration
    for (let x = 0; x < view.width; x++) {
      const t0 = (view.left + x) / zoom
      const t1 = (view.left + x + 1) / zoom
      const i0 = Math.floor(t0 * perSec)
      const i1 = Math.max(i0 + 1, Math.floor(t1 * perSec))
      let m = 0
      for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i]
      const h = Math.max(1, m * (WAVE_H - 6))
      ctx.fillRect(x, mid - h / 2, 1, h)
    }
  }, [view, zoom, audioInfo])

  const seekFromEvent = (e: React.PointerEvent) => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left + el.scrollLeft
    audioEngine.seek(Math.max(0, x / zoom))
    useStudio.setState({ time: audioEngine.time })
  }

  const startDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    const s = useStudio.getState()
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const offset = e.clientX - rect.left
    const mode: 'move' | 'start' | 'end' = offset < 7 ? 'start' : offset > rect.width - 7 ? 'end' : 'move'
    let selection = s.selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) selection = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]
    else if (!selection.includes(id)) selection = [id]
    s.set({ selection })
    const ids = new Set(mode === 'move' ? selection : [id])
    const origin = new Map(s.doc.words.filter((w) => ids.has(w.id)).map((w) => [w.id, { start: w.start, end: w.end }]))
    const startX = e.clientX
    let moved = false
    target.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / zoom
      if (!moved) {
        if (Math.abs(ev.clientX - startX) < 3) return
        moved = true
        useStudio.getState().checkpoint()
      }
      useStudio.getState().mutateSilent((d) => {
        d.words.forEach((w, i) => {
          const o = origin.get(w.id)
          if (!o) return
          if (mode === 'move') {
            const shift = Math.max(-o.start, dt)
            w.start = +(o.start + shift).toFixed(3)
            w.end = +(o.end + shift).toFixed(3)
          } else if (mode === 'start') {
            const min = i > 0 ? d.words[i - 1].start + 0.02 : 0
            w.start = +Math.min(o.end - 0.03, Math.max(min, o.start + dt)).toFixed(3)
          } else {
            const max = i < d.words.length - 1 ? d.words[i + 1].end - 0.02 : Infinity
            w.end = +Math.max(o.start + 0.03, Math.min(max, o.end + dt)).toFixed(3)
          }
        })
      })
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const nudge = (delta: number) => {
    const s = useStudio.getState()
    if (!s.selection.length) return
    const sel = new Set(s.selection)
    s.update((d) => {
      for (const w of d.words) {
        if (!sel.has(w.id)) continue
        w.start = Math.max(0, +(w.start + delta).toFixed(3))
        w.end = Math.max(w.start + 0.02, +(w.end + delta).toFixed(3))
      }
    }, 'nudge')
  }

  const playFromSelection = () => {
    const s = useStudio.getState()
    const first = s.doc.words.find((w) => s.selection.includes(w.id))
    audioEngine.seek(first ? first.start : audioEngine.time)
    audioEngine.play()
  }

  const fit = () => {
    const el = scrollRef.current
    if (el) set({ timelineZoom: Math.max(10, Math.min(400, (el.clientWidth - 40) / duration)) })
  }

  const visible = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.end * zoom >= view.left - 200 && w.start * zoom <= view.left + view.width + 200)

  const tickStep = zoom > 150 ? 0.5 : zoom > 60 ? 1 : zoom > 25 ? 2 : zoom > 10 ? 5 : 10
  const ticks: number[] = []
  for (let t = Math.floor(view.left / zoom / tickStep) * tickStep; t * zoom < view.left + view.width; t += tickStep) if (t >= 0) ticks.push(t)
  const trimEndEff = trimEnd > trimStart ? trimEnd : duration

  return (
    <section className="flex h-[188px] shrink-0 flex-col border-t border-border bg-panel" aria-label="Timeline">
      <div className="flex h-9 items-center gap-1 border-b border-border px-2">
        <span className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => nudge(-0.05)} disabled={!selection.length} title="Nudge earlier 50 ms">
          <ChevronsLeft className="size-4" aria-hidden />
          <span className="sr-only">Nudge earlier</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => nudge(0.05)} disabled={!selection.length} title="Nudge later 50 ms">
          <ChevronsRight className="size-4" aria-hidden />
          <span className="sr-only">Nudge later</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={playFromSelection} title="Play from here">
          <Play className="size-4" aria-hidden />
          <span className="hidden md:inline">Play from here</span>
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" onClick={() => set({ timelineZoom: Math.max(10, zoom / 1.4) })} aria-label="Zoom out">
          <ZoomOut className="size-4" />
        </Button>
        <label htmlFor="tl-zoom" className="sr-only">
          Timeline zoom
        </label>
        <input id="tl-zoom" type="range" min={10} max={400} value={zoom} onChange={(e) => set({ timelineZoom: Number(e.target.value) })} className="w-28" />
        <Button variant="ghost" size="icon" onClick={() => set({ timelineZoom: Math.min(400, zoom * 1.4) })} aria-label="Zoom in">
          <ZoomIn className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={fit} aria-label="Fit timeline to window">
          <Maximize2 className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} dir="ltr" className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden" onPointerDown={seekFromEvent}>
        <div className="relative h-full" style={{ width: totalW, paddingTop: RULER_H }}>
          {/* ruler */}
          <div className="absolute inset-x-0 top-0 border-b border-border" style={{ height: RULER_H }}>
            {ticks.map((t) => (
              <span key={t} className="absolute top-0 h-full border-l border-border pl-1 font-mono text-[10px] leading-[22px] text-muted-foreground" style={{ left: t * zoom }}>
                {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}
                {tickStep < 1 && t % 1 ? '.5' : ''}
              </span>
            ))}
          </div>

          {/* waveform (sticky to viewport) */}
          <canvas ref={waveRef} className="pointer-events-none sticky left-0 block" style={{ width: view.width, height: WAVE_H }} aria-hidden />

          {/* trim shading */}
          {audioInfo && trimStart > 0 && <div className="pointer-events-none absolute bg-background/70" style={{ left: 0, width: trimStart * zoom, top: RULER_H, bottom: 0 }} aria-hidden />}
          {audioInfo && trimEndEff < duration && <div className="pointer-events-none absolute bg-background/70" style={{ left: trimEndEff * zoom, right: 0, top: RULER_H, bottom: 0 }} aria-hidden />}

          {/* word lane */}
          <div className="absolute inset-x-0" style={{ top: RULER_H + WAVE_H + 6, height: LANE_H }}>
            {visible.map(({ w }) => {
              const active = time >= w.start && time < w.end
              const selected = selSet.has(w.id)
              return (
                <button
                  key={w.id}
                  type="button"
                  onPointerDown={(e) => startDrag(e, w.id)}
                  onDoubleClick={() => {
                    audioEngine.seek(w.start)
                    audioEngine.play()
                  }}
                  aria-pressed={selected}
                  aria-label={`${w.text}, ${w.start.toFixed(2)} to ${w.end.toFixed(2)} seconds`}
                  title={`${w.start.toFixed(2)}s – ${w.end.toFixed(2)}s`}
                  className={cn(
                    'group absolute top-0 flex h-full cursor-grab items-center justify-center overflow-hidden rounded border text-base leading-none transition-colors active:cursor-grabbing',
                    w.ayahIndex % 2 ? 'bg-panel-2' : 'bg-muted',
                    selected ? 'border-primary text-foreground' : 'border-border text-muted-foreground',
                    active && 'bg-primary/25 text-foreground',
                  )}
                  style={{ left: w.start * zoom, width: Math.max(4, (w.end - w.start) * zoom), fontFamily: `"${arabicFont}", serif` }}
                  dir="rtl"
                  lang="ar"
                >
                  <span className="pointer-events-none truncate px-1">{w.text}</span>
                  <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-primary/0 group-hover:bg-primary/40" aria-hidden />
                  <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-primary/0 group-hover:bg-primary/40" aria-hidden />
                </button>
              )
            })}
          </div>

          {/* playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary" style={{ left: time * zoom }} aria-hidden>
            <div className="absolute -left-1 top-0 size-2.5 rotate-45 bg-primary" />
          </div>
        </div>
      </div>
    </section>
  )
}
