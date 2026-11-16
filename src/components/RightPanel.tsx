import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useStudio, useT } from '../lib/store'
import { RATIOS, RESOLUTIONS, sizeFor } from '../lib/presets'
import type { AnimationPreset, Easing, ProjectDoc, Theme } from '../lib/types'
import { Button, ColorField, NumberField, Section, Segmented, Select, Slider, Toggle } from './ui'

type Up = (m: (d: ProjectDoc) => void, key?: string) => void

export function RightPanel() {
  const doc = useStudio((s) => s.doc)
  const update = useStudio((s) => s.update)
  const selection = useStudio((s) => s.selection)
  const t = useT()

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-s border-border bg-panel" aria-label="Properties">
      {selection.length > 0 && <SelectionSection />}
      <CanvasSection doc={doc} update={update} />
      <Section title={t('text')}>
        <Slider label="Size" value={doc.style.arabicSize} min={32} max={220} step={1} onChange={(v, k) => update((d) => void (d.style.arabicSize = v), k)} />
        <Select
          label="Weight"
          value={String(doc.style.arabicWeight)}
          options={[
            { value: '400', label: 'Regular' },
            { value: '700', label: 'Bold' },
          ]}
          onChange={(v) => update((d) => void (d.style.arabicWeight = Number(v)))}
        />
        <Slider label="Line height" value={doc.style.lineHeight} min={1.1} max={3} onChange={(v, k) => update((d) => void (d.style.lineHeight = v), k)} />
        <Slider label="Word spacing" value={doc.style.wordSpacing} min={0.1} max={1.2} onChange={(v, k) => update((d) => void (d.style.wordSpacing = v), k)} />
        <Slider label="Max width" value={doc.style.maxWidth} min={0.4} max={0.98} onChange={(v, k) => update((d) => void (d.style.maxWidth = v), k)} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Lines per screen" value={doc.style.maxLines} min={1} max={10} step={1} onChange={(v, k) => update((d) => void (d.style.maxLines = v), k)} />
        <Slider label="Vertical position" value={doc.style.verticalPosition} min={0.15} max={0.85} onChange={(v, k) => update((d) => void (d.style.verticalPosition = v), k)} format={(v) => `${Math.round(v * 100)}%`} />
        <Segmented
          label="Alignment"
          value={doc.style.align}
          options={[
            { value: 'right', label: 'Right' },
            { value: 'center', label: 'Center' },
            { value: 'left', label: 'Left' },
          ]}
          onChange={(v) => update((d) => void (d.style.align = v))}
        />
        <Segmented
          label="Reveal"
          value={doc.style.revealMode}
          options={[
            { value: 'all', label: 'Whole ayah', title: 'Show the ayah, highlight words as recited' },
            { value: 'progressive', label: 'Word by word', title: 'Reveal each word as it is recited' },
          ]}
          onChange={(v) => update((d) => void (d.style.revealMode = v))}
        />
        {doc.style.revealMode === 'all' && <Slider label="Upcoming words opacity" value={doc.style.pendingOpacity} min={0} max={1} onChange={(v, k) => update((d) => void (d.style.pendingOpacity = v), k)} />}
        <Toggle label="Ayah number marker" checked={doc.style.showAyahNumber} onChange={(v) => update((d) => void (d.style.showAyahNumber = v))} />
      </Section>

      <Section title={t('animation')}>
        <Select<AnimationPreset>
          label="Preset"
          value={doc.style.animation.preset}
          options={[
            { value: 'none', label: 'None' },
            { value: 'fade', label: 'Fade in' },
            { value: 'rise', label: 'Soft rise' },
            { value: 'blur', label: 'Blur to sharp' },
            { value: 'pop', label: 'Gentle scale pop' },
            { value: 'float', label: 'Slow float / breathing' },
            { value: 'pulse', label: 'Glow pulse' },
          ]}
          onChange={(v) => update((d) => void (d.style.animation.preset = v))}
        />
        <Select<Easing>
          label="Easing"
          value={doc.style.animation.easing}
          options={[
            { value: 'expoOut', label: 'Expo out (smooth)' },
            { value: 'easeOut', label: 'Ease out' },
            { value: 'easeInOut', label: 'Ease in-out' },
            { value: 'linear', label: 'Linear' },
          ]}
          onChange={(v) => update((d) => void (d.style.animation.easing = v))}
        />
        <Slider label="Duration" value={doc.style.animation.duration} min={0.1} max={2} onChange={(v, k) => update((d) => void (d.style.animation.duration = v), k)} format={(v) => `${v.toFixed(2)}s`} />
        <Slider label="Intensity" value={doc.style.animation.intensity} min={0} max={1} onChange={(v, k) => update((d) => void (d.style.animation.intensity = v), k)} />
      </Section>

      <ColorsSection theme={doc.theme} update={update} />

      <Section title={t('glow')}>
        <Toggle label="Enable Deep Glow" checked={doc.glow.enabled} onChange={(v) => update((d) => void (d.glow.enabled = v))} />
        {doc.glow.enabled && (
          <>
            <Slider label="Threshold" value={doc.glow.threshold} min={0} max={0.9} onChange={(v, k) => update((d) => void (d.glow.threshold = v), k)} />
            <Slider label="Radius" value={doc.glow.radius} min={0} max={1} onChange={(v, k) => update((d) => void (d.glow.radius = v), k)} />
            <Slider label="Intensity / exposure" value={doc.glow.intensity} min={0} max={3} onChange={(v, k) => update((d) => void (d.glow.intensity = v), k)} />
            <Slider label="Falloff" value={doc.glow.falloff} min={0} max={1} onChange={(v, k) => update((d) => void (d.glow.falloff = v), k)} />
            <Slider label="Active word glow" value={doc.glow.activeBoost} min={0} max={2} onChange={(v, k) => update((d) => void (d.glow.activeBoost = v), k)} />
            <Slider label="Recited words glow" value={doc.glow.idleGlow} min={0} max={1} onChange={(v, k) => update((d) => void (d.glow.idleGlow = v), k)} />
            <Slider label="Chromatic" value={doc.glow.chromatic} min={0} max={1} onChange={(v, k) => update((d) => void (d.glow.chromatic = v), k)} />
            <Toggle label="Glow-only preview" checked={doc.glow.glowOnly} onChange={(v) => update((d) => void (d.glow.glowOnly = v))} />
          </>
        )}
      </Section>

      <Section title={t('rain')} defaultOpen={false}>
        <Toggle label="Enable rain on glass" checked={doc.rain.enabled} onChange={(v) => update((d) => void (d.rain.enabled = v))} />
        {doc.rain.enabled && (
          <>
            <Slider label="Drop density" value={doc.rain.density} min={0} max={1} onChange={(v, k) => update((d) => void (d.rain.density = v), k)} />
            <Slider label="Drop size" value={doc.rain.size} min={0} max={1} onChange={(v, k) => update((d) => void (d.rain.size = v), k)} />
            <Slider label="Speed" value={doc.rain.speed} min={0} max={1} onChange={(v, k) => update((d) => void (d.rain.speed = v), k)} />
            <Slider label="Fog / blur" value={doc.rain.fog} min={0} max={1} onChange={(v, k) => update((d) => void (d.rain.fog = v), k)} />
            <Slider label="Refraction" value={doc.rain.refraction} min={0} max={1.5} onChange={(v, k) => update((d) => void (d.rain.refraction = v), k)} />
            <Toggle label="Refract text too" checked={doc.rain.refractText} onChange={(v) => update((d) => void (d.rain.refractText = v))} />
          </>
        )}
      </Section>

      <Section title={t('background')} defaultOpen={false}>
        <Segmented
          label="Background type"
          value={doc.background.type}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video' },
          ]}
          onChange={(v) => update((d) => void (d.background.type = v))}
        />
        {doc.background.type === 'gradient' && <Slider label="Angle" value={doc.background.angle} min={0} max={360} step={1} onChange={(v, k) => update((d) => void (d.background.angle = v), k)} format={(v) => `${v}°`} />}
        {(doc.background.type === 'image' || doc.background.type === 'video') && <Slider label="Dim" value={doc.background.dim} min={0} max={0.95} onChange={(v, k) => update((d) => void (d.background.dim = v), k)} />}
      </Section>

      <Section title="Translation" defaultOpen={false}>
        <Toggle label="Show translation line" checked={doc.style.translation.enabled} onChange={(v) => update((d) => void (d.style.translation.enabled = v))} />
        <Slider label="Size" value={doc.style.translation.size} min={14} max={90} step={1} onChange={(v, k) => update((d) => void (d.style.translation.size = v), k)} />
        <Select
          label="Weight"
          value={String(doc.style.translation.weight)}
          options={[
            { value: '300', label: 'Light' },
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Medium' },
            { value: '600', label: 'Semibold' },
          ]}
          onChange={(v) => update((d) => void (d.style.translation.weight = Number(v)))}
        />
        <Slider label="Line height" value={doc.style.translation.lineHeight} min={1} max={2.5} onChange={(v, k) => update((d) => void (d.style.translation.lineHeight = v), k)} />
        <Slider label="Max width" value={doc.style.translation.maxWidth} min={0.4} max={0.98} onChange={(v, k) => update((d) => void (d.style.translation.maxWidth = v), k)} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Gap below Arabic" value={doc.style.translation.gap} min={0} max={200} step={1} onChange={(v, k) => update((d) => void (d.style.translation.gap = v), k)} />
        <Segmented
          label="Direction"
          value={doc.style.translation.direction}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'ltr', label: 'LTR' },
            { value: 'rtl', label: 'RTL' },
          ]}
          onChange={(v) => update((d) => void (d.style.translation.direction = v))}
        />
      </Section>

      <AudioSection doc={doc} update={update} />
    </aside>
  )
}

function CanvasSection({ doc, update }: { doc: ProjectDoc; update: Up }) {
  const t = useT()
  const short = Math.min(doc.canvas.width, doc.canvas.height)
  const setRatio = (id: string) => {
    const r = RATIOS.find((x) => x.id === id)!
    const size = sizeFor(r.w, r.h, short)
    update((d) => void (d.canvas = { ...d.canvas, ratio: id, ...size }))
  }
  const setRes = (s: number) => {
    const r = RATIOS.find((x) => x.id === doc.canvas.ratio)
    const size = r ? sizeFor(r.w, r.h, s) : sizeFor(doc.canvas.width, doc.canvas.height, s)
    update((d) => void (d.canvas = { ...d.canvas, ...size }))
  }
  return (
    <Section title={t('canvas')}>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Aspect ratio">
        {RATIOS.map((r) => {
          const active = doc.canvas.ratio === r.id
          const k = 22 / Math.max(r.w, r.h)
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={r.hint}
              onClick={() => setRatio(r.id)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border py-2 text-xs transition-colors ${active ? 'border-primary bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              <span className="rounded-sm border border-current" style={{ width: r.w * k, height: r.h * k }} aria-hidden />
              {r.label}
            </button>
          )
        })}
      </div>
      <Segmented
        label="Resolution"
        value={RESOLUTIONS.find((r) => r.short === short)?.id ?? 'custom'}
        options={[...RESOLUTIONS.map((r) => ({ value: r.id as string, label: r.id })), { value: 'custom', label: 'Custom' }]}
        onChange={(v) => {
          const r = RESOLUTIONS.find((x) => x.id === v)
          if (r) setRes(r.short)
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={doc.canvas.width} min={16} max={7680} step={2} onChange={(v) => update((d) => void (d.canvas = { ...d.canvas, width: Math.round(v / 2) * 2, ratio: 'custom' }), 'cw')} />
        <NumberField label="Height" value={doc.canvas.height} min={16} max={7680} step={2} onChange={(v) => update((d) => void (d.canvas = { ...d.canvas, height: Math.round(v / 2) * 2, ratio: 'custom' }), 'ch')} />
      </div>
      <Toggle label="Safe-area guides" hint="TikTok / Reels / Shorts UI" checked={doc.canvas.safeGuides} onChange={(v) => update((d) => void (d.canvas.safeGuides = v))} />
    </Section>
  )
}

function ColorsSection({ theme, update }: { theme: Theme; update: Up }) {
  const t = useT()
  const set = (k: keyof Theme) => (v: string) => update((d) => void ((d.theme[k] as string) = v), `color-${k}`)
  return (
    <Section title={t('colors')}>
      <ColorField label="Background" value={theme.background} onChange={set('background')} />
      <ColorField label="Gradient end" value={theme.background2} onChange={set('background2')} />
      <ColorField label="Upcoming words" value={theme.pending} onChange={set('pending')} />
      <ColorField label="Current word" value={theme.highlight} onChange={set('highlight')} />
      <ColorField label="Recited words" value={theme.spoken} onChange={set('spoken')} />
      <ColorField label="Glow" value={theme.glow} onChange={set('glow')} />
      <ColorField label="Translation" value={theme.translation} onChange={set('translation')} />
      <ColorField label="Rain tint" value={theme.rainTint} onChange={set('rainTint')} />
    </Section>
  )
}

function SelectionSection() {
  const t = useT()
  const selection = useStudio((s) => s.selection)
  const words = useStudio((s) => s.doc.words)
  const theme = useStudio((s) => s.doc.theme)
  const update = useStudio((s) => s.update)
  const set = useStudio((s) => s.set)
  const sel = new Set(selection)
  const selected = words.filter((w) => sel.has(w.id))
  const first = selected[0]
  const [editing, setEditing] = useState(false)
  if (!first) return null

  const apply = (fn: (w: (typeof words)[number]) => void, key?: string) =>
    update((d) => {
      for (const w of d.words) if (sel.has(w.id)) fn(w)
    }, key)

  return (
    <Section title={`${t('selection')} (${selected.length})`} right={<Button variant="ghost" size="sm" onClick={() => set({ selection: [] })}>Clear</Button>}>
      <p className="rounded-md bg-panel-2 px-3 py-2 text-center text-2xl leading-relaxed text-foreground" dir="rtl" lang="ar" style={{ fontFamily: '"Amiri Quran", serif' }}>
        {selected.map((w) => w.text).join(' ')}
      </p>
      <ColorField label="Text colour" value={first.color ?? theme.spoken} onChange={(v) => apply((w) => void (w.color = v), 'sel-color')} />
      <ColorField label="Glow colour" value={first.glowColor ?? theme.glow} onChange={(v) => apply((w) => void (w.glowColor = v), 'sel-glow')} />
      <Button variant="outline" size="sm" onClick={() => apply((w) => void (delete w.color, delete w.glowColor))}>
        <RotateCcw className="size-4" aria-hidden />
        Reset to theme colours
      </Button>
      {selected.length === 1 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Start (s)" value={+first.start.toFixed(3)} step={0.01} min={0} onChange={(v) => apply((w) => void (w.start = Math.max(0, v)), 'sel-start')} />
            <NumberField label="End (s)" value={+first.end.toFixed(3)} step={0.01} min={0} onChange={(v) => apply((w) => void (w.end = Math.max(w.start + 0.02, v)), 'sel-end')} />
          </div>
          {editing ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Correct the word (only if the source text was wrong)
              <input
                defaultValue={first.text}
                dir="rtl"
                lang="ar"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v) apply((w) => void (w.text = v))
                  setEditing(false)
                }}
                className="h-10 rounded-md border border-border bg-panel-2 px-2 text-xl text-foreground outline-none focus:border-primary"
                style={{ fontFamily: '"Amiri Quran", serif' }}
              />
            </label>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit word text
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">Arrow keys nudge timing by 10 ms (Shift: 100 ms).</p>
    </Section>
  )
}

function AudioSection({ doc, update }: { doc: ProjectDoc; update: Up }) {
  const t = useT()
  const duration = useStudio((s) => s.audioInfo?.duration ?? 0)
  return (
    <Section title={t('audio')} defaultOpen={false}>
      <Slider label="Volume (preview)" value={doc.audio.volume} min={0} max={1} onChange={(v, k) => update((d) => void (d.audio.volume = v), k)} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Mute preview" checked={doc.audio.muted} onChange={(v) => update((d) => void (d.audio.muted = v))} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Trim start (s)" value={+doc.audio.trimStart.toFixed(2)} min={0} max={duration} step={0.1} onChange={(v) => update((d) => void (d.audio.trimStart = Math.max(0, v)), 'trimStart')} />
        <NumberField label="Trim end (s, 0 = end)" value={+doc.audio.trimEnd.toFixed(2)} min={0} max={duration} step={0.1} onChange={(v) => update((d) => void (d.audio.trimEnd = Math.max(0, v)), 'trimEnd')} />
      </div>
      <Slider label="Fade in" value={doc.audio.fadeIn} min={0} max={5} onChange={(v, k) => update((d) => void (d.audio.fadeIn = v), k)} format={(v) => `${v.toFixed(1)}s`} />
      <Slider label="Fade out" value={doc.audio.fadeOut} min={0} max={5} onChange={(v, k) => update((d) => void (d.audio.fadeOut = v), k)} format={(v) => `${v.toFixed(1)}s`} />
    </Section>
  )
}
