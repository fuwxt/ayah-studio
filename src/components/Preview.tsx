import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, SkipBack, Camera, Music } from 'lucide-react'
import { useStudio, useT } from '../lib/store'
import { StudioRenderer } from '../engine/renderer'
import { audioEngine } from '../engine/audio'
import { exportThumbnail, importAudio } from '../lib/actions'
import { Button, formatTime } from './ui'

export function Preview() {
  const t = useT()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<StudioRenderer | null>(null)
  const [box, setBox] = useState({ w: 360, h: 640 })
  const [webgl, setWebgl] = useState(true)
  const canvasW = useStudio((s) => s.doc.canvas.width)
  const canvasH = useStudio((s) => s.doc.canvas.height)
  const safeGuides = useStudio((s) => s.doc.canvas.safeGuides)
  const ratio = useStudio((s) => s.doc.canvas.ratio)
  const hasWords = useStudio((s) => s.doc.words.length > 0)
  const hasAudio = useStudio((s) => !!s.audioInfo)

  // Fit the output aspect ratio into the available space.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const pad = 32
      const aw = el.clientWidth - pad
      const ah = el.clientHeight - pad
      const k = Math.min(aw / canvasW, ah / canvasH)
      setBox({ w: Math.max(80, Math.floor(canvasW * k)), h: Math.max(80, Math.floor(canvasH * k)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [canvasW, canvasH])

  useEffect(() => {
    if (!canvasRef.current) return
    const r = new StudioRenderer(canvasRef.current)
    rendererRef.current = r
    setWebgl(r.webgl)
    return () => r.dispose()
  }, [])

  // Render loop
  useEffect(() => {
    let raf = 0
    let lastStoreUpdate = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const r = rendererRef.current
      if (!r) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const s = useStudio.getState()
      const k = Math.min(1, (box.w * dpr) / s.doc.canvas.width)
      r.setSize(s.doc.canvas.width * k, s.doc.canvas.height * k)
      const time = audioEngine.tick()
      const fx = audioEngine.playing ? time : performance.now() / 1000
      r.render(s.doc, time, { bg: s.bgMedia?.el ?? null }, fx)
      const now = performance.now()
      if (now - lastStoreUpdate > 30 || s.playing !== audioEngine.playing) {
        lastStoreUpdate = now
        if (Math.abs(s.time - time) > 0.001 || s.playing !== audioEngine.playing) useStudio.setState({ time, playing: audioEngine.playing })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [box.w])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = rendererRef.current
    if (!r) return
    const s = useStudio.getState()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * r.width
    const y = ((e.clientY - rect.top) / rect.height) * r.height
    const { screens, metrics } = r.getLayout(s.doc)
    const { index } = r.screenAt(s.doc, audioEngine.time)
    const screen = screens[index]
    const hit = screen?.items.find((it) => it.wordIndex >= 0 && Math.abs(x - it.cx) < it.w / 2 + 4 && Math.abs(y - it.cy) < metrics.fontPx * 0.8)
    if (!hit) return s.set({ selection: [] })
    const id = s.doc.words[hit.wordIndex].id
    if (e.shiftKey || e.ctrlKey || e.metaKey) s.set({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] })
    else s.set({ selection: [id] })
  }

  const vertical = canvasH > canvasW
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="checker relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div className="relative shadow-2xl" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} onClick={onCanvasClick} className="block h-full w-full" aria-label="Video preview. Click a word to select it." />
          {safeGuides && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {vertical ? (
                <>
                  <div className="absolute inset-x-0 top-0 h-[11%] border-b border-dashed border-primary/70 bg-primary/10" />
                  <div className="absolute inset-x-0 bottom-0 h-[22%] border-t border-dashed border-primary/70 bg-primary/10" />
                  <div className="absolute bottom-[22%] end-0 top-[40%] w-[15%] border-s border-dashed border-primary/70 bg-primary/10" />
                </>
              ) : (
                <div className="absolute inset-[5%] border border-dashed border-primary/70" />
              )}
              <span className="absolute start-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-primary">Safe area · {ratio}</span>
            </div>
          )}
          {!hasWords && !hasAudio && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-balance text-sm text-muted-foreground">{t('noAudio')}</p>
              <Button variant="primary" size="sm" onClick={importAudio}>
                <Music className="size-4" aria-hidden />
                {t('importAudio')}
              </Button>
            </div>
          )}
        </div>
        {!webgl && <p className="absolute bottom-2 start-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">WebGL2 unavailable — using simplified glow, rain disabled.</p>}
      </div>
      <Transport />
    </div>
  )
}

function Transport() {
  const t = useT()
  const time = useStudio((s) => s.time)
  const playing = useStudio((s) => s.playing)
  const muted = useStudio((s) => s.doc.audio.muted)
  const volume = useStudio((s) => s.doc.audio.volume)
  const rate = useStudio((s) => s.doc.audio.rate)
  const duration = useStudio((s) => s.audioInfo?.duration ?? 0)
  const update = useStudio((s) => s.update)

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border bg-panel px-3">
      <Button variant="ghost" size="icon" onClick={() => audioEngine.seek(audioEngine.range().start)} aria-label="Go to start">
        <SkipBack className="size-4" />
      </Button>
      <Button variant="primary" size="icon" onClick={() => (audioEngine.playing ? audioEngine.pause() : audioEngine.play())} aria-label={playing ? t('pause') : t('play')} title="Space">
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {formatTime(time)} <span className="text-muted-foreground">/ {formatTime(duration || audioEngine.duration)}</span>
      </span>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" onClick={() => update((d) => void (d.audio.muted = !d.audio.muted))} aria-label={muted ? t('unmute') : t('mute')} aria-pressed={muted}>
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </Button>
      <label htmlFor="volume" className="sr-only">
        Volume
      </label>
      <input id="volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => update((d) => void (d.audio.volume = Number(e.target.value)), 'volume')} className="w-24" />
      <label htmlFor="rate" className="sr-only">
        Preview speed
      </label>
      <select id="rate" value={rate} onChange={(e) => update((d) => void (d.audio.rate = Number(e.target.value)))} className="h-7 rounded-md border border-border bg-panel-2 px-1 text-xs text-foreground">
        {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      <Button variant="ghost" size="icon" onClick={exportThumbnail} aria-label="Save thumbnail PNG" title="Save still frame (PNG)">
        <Camera className="size-4" />
      </Button>
    </div>
  )
}
