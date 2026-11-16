import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Share2, Cpu, Image as ImageIcon } from 'lucide-react'
import { useStudio, useT } from '../../lib/store'
import { desktop } from '../../lib/bridge'
import { RATIOS, RESOLUTIONS, sizeFor } from '../../lib/presets'
import { exportRange, runExport, type ExportProgress, type ExportSpec } from '../../engine/exporter'
import { exportThumbnail } from '../../lib/actions'
import { Button, Dialog, Segmented, Slider, Toggle, cn, formatTime } from '../ui'

type FormatId = 'mp4-h264' | 'mp4-h265' | 'webm' | 'prores' | 'png'
const FORMATS: Record<FormatId, { label: string; format: ExportSpec['format']; codec: ExportSpec['codec'] }> = {
  'mp4-h264': { label: 'MP4 · H.264', format: 'mp4', codec: 'h264' },
  'mp4-h265': { label: 'MP4 · H.265', format: 'mp4', codec: 'h265' },
  webm: { label: 'WebM · VP9', format: 'webm', codec: 'vp9' },
  prores: { label: 'MOV · ProRes', format: 'mov', codec: 'prores' },
  png: { label: 'PNG sequence', format: 'png', codec: 'png' },
}

const QUICK = [
  { id: 'reels', label: 'TikTok · Reels · Shorts', ratios: ['9:16'], short: 1080, fps: 30 },
  { id: 'all', label: 'All platforms (9:16 + 1:1 + 16:9)', ratios: ['9:16', '1:1', '16:9'], short: 1080, fps: 30 },
  { id: 'feed', label: 'Instagram feed 4:5', ratios: ['4:5'], short: 1080, fps: 30 },
  { id: 'yt4k', label: 'YouTube 4K', ratios: ['16:9'], short: 2160, fps: 30 },
]

export function ExportDialog() {
  const t = useT()
  const open = useStudio((s) => s.dialog === 'export')
  const set = useStudio((s) => s.set)
  const canvas = useStudio((s) => s.doc.canvas)
  const hasAudio = useStudio((s) => !!s.audioInfo?.path)

  const [ratios, setRatios] = useState<string[]>([canvas.ratio])
  const [short, setShort] = useState(Math.min(canvas.width, canvas.height))
  const [fps, setFps] = useState(30)
  const [fmt, setFmt] = useState<FormatId>('mp4-h264')
  const [quality, setQuality] = useState(75)
  const [hardware, setHardware] = useState<'auto' | 'cpu'>('auto')
  const [withAudio, setWithAudio] = useState(true)
  const [encoders, setEncoders] = useState<Record<string, boolean> | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [jobIndex, setJobIndex] = useState(0)
  const [outputs, setOutputs] = useState<string[]>([])
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setRatios(RATIOS.some((r) => r.id === canvas.ratio) ? [canvas.ratio] : ['custom'])
    setShort(Math.min(canvas.width, canvas.height))
    setOutputs([])
    setProgress(null)
    if (desktop && !encoders) desktop.encoders().then(setEncoders).catch(() => setEncoders({}))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const specs: ExportSpec[] = ratios.map((id) => {
    const r = RATIOS.find((x) => x.id === id)
    const size = r ? sizeFor(r.w, r.h, short) : { width: canvas.width, height: canvas.height }
    const f = FORMATS[fmt]
    return { label: id === 'custom' ? `${canvas.width}x${canvas.height}` : id, ...size, fps, format: f.format, codec: f.codec, quality, hardware, withAudio }
  })

  const { start, end } = exportRange(useStudio.getState().doc)
  const gpu = encoders ? Object.entries(encoders).filter(([k, v]) => v && /nvenc|qsv|amf|videotoolbox/.test(k)).map(([k]) => k) : []

  const startExport = async () => {
    cancelRef.current = false
    setRunning(true)
    setOutputs([])
    const done: string[] = []
    try {
      for (let i = 0; i < specs.length; i++) {
        setJobIndex(i)
        const s = useStudio.getState()
        const out = await runExport(s.doc, specs[i], {
          audioPath: s.audioInfo?.path,
          bg: s.doc.background.type === 'image' || s.doc.background.type === 'video' ? (s.bgMedia?.el ?? null) : null,
          isCancelled: () => cancelRef.current,
          onProgress: setProgress,
        })
        if (!out) break
        done.push(out)
        setOutputs([...done])
      }
      if (done.length) {
        useStudio.setState({ lastExport: done[done.length - 1] })
        useStudio.getState().notify(`Exported ${done.length} video${done.length > 1 ? 's' : ''} to your Exports folder.`, 'success')
      }
    } catch (e) {
      useStudio.getState().notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const toggleRatio = (id: string) => setRatios((r) => (r.includes(id) ? (r.length > 1 ? r.filter((x) => x !== id) : r) : [...r, id]))

  return (
    <Dialog
      open={open}
      title={t('export')}
      onClose={() => !running && set({ dialog: null })}
      width="max-w-2xl"
      footer={
        running ? (
          <Button variant="danger" onClick={() => (cancelRef.current = true)}>
            Cancel export
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={exportThumbnail}>
              <ImageIcon className="size-4" aria-hidden />
              Thumbnail PNG
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => set({ dialog: null })}>
              Close
            </Button>
            <Button variant="primary" disabled={!desktop} onClick={startExport}>
              Export {specs.length > 1 ? `${specs.length} videos` : 'video'}
            </Button>
          </>
        )
      }
    >
      {!desktop && (
        <p className="mb-4 rounded-md border border-primary/40 bg-primary/10 p-3 text-xs leading-relaxed text-foreground">
          This is the web preview. Video export uses the bundled FFmpeg in the desktop app — download the Windows installer from the GitHub release. You can still save a thumbnail PNG here.
        </p>
      )}

      {running || outputs.length ? (
        <div className="flex flex-col gap-4">
          {specs.map((s, i) => {
            const isCurrent = running && i === jobIndex
            const isDone = i < outputs.length
            const pct = isDone ? 100 : isCurrent && progress ? Math.round((progress.frame / progress.frames) * 100) : 0
            return (
              <div key={s.label} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">
                    {s.label} · {s.width}×{s.height} · {s.fps} fps
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {isDone ? 'Done' : isCurrent && progress ? `${progress.frame}/${progress.frames} · ETA ${formatTime(progress.eta)}` : 'Queued'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${s.label} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                {isCurrent && progress?.encoder && <span className="text-[11px] text-muted-foreground">Encoder: {progress.encoder}</span>}
                {isDone && (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{outputs[i]}</span>
                    <Button size="sm" variant="ghost" onClick={() => desktop?.showItem(outputs[i])}>
                      <FolderOpen className="size-4" aria-hidden />
                      Show
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          {!running && outputs.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-panel-2 p-3">
              <p className="text-xs text-muted-foreground">Your reel is ready to upload to TikTok, Instagram, Facebook and YouTube.</p>
              <Button size="sm" variant="primary" onClick={() => set({ dialog: 'publish' })}>
                <Share2 className="size-4" aria-hidden />
                {t('publish')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Quick presets</span>
            <div className="grid grid-cols-2 gap-2">
              {QUICK.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setRatios(q.ratios)
                    setShort(q.short)
                    setFps(q.fps)
                    setFmt('mp4-h264')
                  }}
                  className="cursor-pointer rounded-md border border-border px-3 py-2 text-start text-xs text-foreground transition-colors hover:border-primary hover:bg-muted"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Aspect ratios (select several for batch export)</span>
            <div className="flex flex-wrap gap-1.5">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={ratios.includes(r.id)}
                  onClick={() => toggleRatio(r.id)}
                  className={cn('cursor-pointer rounded-md border px-3 py-1.5 text-xs transition-colors', ratios.includes(r.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  {r.label}
                </button>
              ))}
              {canvas.ratio === 'custom' && (
                <button type="button" aria-pressed={ratios.includes('custom')} onClick={() => toggleRatio('custom')} className={cn('cursor-pointer rounded-md border px-3 py-1.5 text-xs', ratios.includes('custom') ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
                  Custom {canvas.width}×{canvas.height}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Resolution</span>
              <Segmented label="Resolution" value={String(short)} options={RESOLUTIONS.map((r) => ({ value: String(r.short), label: r.id }))} onChange={(v) => setShort(Number(v))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Frame rate</span>
              <Segmented label="Frame rate" value={String(fps)} options={[24, 30, 60].map((f) => ({ value: String(f), label: `${f}` }))} onChange={(v) => setFps(Number(v))} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Format</span>
            <Segmented label="Format" value={fmt} options={(Object.keys(FORMATS) as FormatId[]).map((k) => ({ value: k, label: FORMATS[k].label }))} onChange={setFmt} />
          </div>

          {fmt !== 'png' && fmt !== 'prores' && <Slider label="Quality" value={quality} min={10} max={100} step={1} onChange={(v) => setQuality(v)} format={(v) => `${v}`} />}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Cpu className="size-3.5" aria-hidden />
                Encoding
              </span>
              <Segmented
                label="Encoding"
                value={hardware}
                options={[
                  { value: 'auto', label: 'GPU if available' },
                  { value: 'cpu', label: 'CPU' },
                ]}
                onChange={setHardware}
              />
              <span className="text-[11px] text-muted-foreground">{encoders ? (gpu.length ? `Detected: ${gpu.join(', ')}` : 'No GPU encoder detected — CPU (x264/x265) will be used.') : desktop ? 'Detecting encoders…' : ''}</span>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <Toggle label="Include recitation audio" hint={hasAudio ? 'Unmute = with audio' : 'No audio file loaded'} checked={withAudio && hasAudio} onChange={setWithAudio} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Duration {formatTime(end - start)} · {Math.ceil((end - start) * fps)} frames per video · rendered frame-by-frame (not screen-recorded)
          </p>
        </div>
      )}
    </Dialog>
  )
}
