import { useEffect, useState } from 'react'
import { Music, FileText, Globe, AudioLines, Wand2, ImageIcon, Film, AlertTriangle, FolderOpen, Plus, Upload, Download, Save, Check } from 'lucide-react'
import { useStudio, useT } from '../lib/store'
import { autoAlign, importAudio, openProject, pickBackground, saveCurrentTheme, importTheme, exportTheme, addCustomFont } from '../lib/actions'
import { BUILT_IN_THEMES } from '../lib/presets'
import { BUNDLED_FONTS } from '../lib/fonts'
import { desktop } from '../lib/bridge'
import type { Theme } from '../lib/types'
import { Button, Section, cn, formatTime } from './ui'

type Tab = 'media' | 'themes' | 'fonts'

export function LeftPanel() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('media')
  return (
    <aside className="flex w-72 shrink-0 flex-col border-e border-border bg-panel" aria-label="Assets">
      <div role="tablist" className="flex border-b border-border">
        {(['media', 'themes', 'fonts'] as Tab[]).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn('flex-1 cursor-pointer border-b-2 py-2.5 text-xs font-semibold transition-colors', tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t(id)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'media' && <MediaTab />}
        {tab === 'themes' && <ThemesTab />}
        {tab === 'fonts' && <FontsTab />}
      </div>
    </aside>
  )
}

function MediaTab() {
  const t = useT()
  const audioInfo = useStudio((s) => s.audioInfo)
  const wordCount = useStudio((s) => s.doc.words.length)
  const ayahCount = useStudio((s) => s.doc.ayahs.length)
  const needsVerification = useStudio((s) => s.doc.meta.needsVerification)
  const surah = useStudio((s) => s.doc.meta.surahName)
  const bgType = useStudio((s) => s.doc.background.type)
  const bgName = useStudio((s) => s.doc.background.mediaName)
  const set = useStudio((s) => s.set)
  const [recent, setRecent] = useState<Array<{ name: string; dir: string; modified: number }>>([])

  useEffect(() => {
    desktop?.listProjects().then(setRecent).catch(() => {})
  }, [audioInfo])

  return (
    <>
      <Section title={t('audio')}>
        <button
          type="button"
          onClick={importAudio}
          className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border p-3 text-start transition-colors hover:border-primary hover:bg-muted"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Music className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-foreground">{audioInfo ? audioInfo.name : t('importAudio')}</span>
            <span className="text-xs text-muted-foreground">{audioInfo ? formatTime(audioInfo.duration) : 'mp3 · wav · m4a · ogg · flac'}</span>
          </span>
        </button>
      </Section>

      <Section title={t('ayahText')}>
        <p className="text-xs text-muted-foreground">
          {wordCount ? `${ayahCount} ayah · ${wordCount} words${surah ? ` · ${surah}` : ''}` : t('noWords')}
        </p>
        {needsVerification && (
          <p className="flex gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            {t('verifyWarning')}
          </p>
        )}
        <div className="grid grid-cols-1 gap-1.5">
          <Button variant="outline" size="sm" className="justify-start" onClick={() => set({ dialog: 'text' })}>
            <FileText className="size-4" aria-hidden />
            {t('editText')}
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => set({ dialog: 'online' })}>
            <Globe className="size-4" aria-hidden />
            {t('fetchOnline')}
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => set({ dialog: 'stt' })}>
            <AudioLines className="size-4" aria-hidden />
            {t('extractFromAudio')}
          </Button>
          <Button variant="primary" size="sm" className="justify-start" onClick={autoAlign} disabled={!audioInfo || !wordCount}>
            <Wand2 className="size-4" aria-hidden />
            {t('autoAlign')}
          </Button>
        </div>
      </Section>

      <Section title={t('background')}>
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" onClick={() => pickBackground('image')}>
            <ImageIcon className="size-4" aria-hidden />
            Image
          </Button>
          <Button variant="outline" size="sm" onClick={() => pickBackground('video')}>
            <Film className="size-4" aria-hidden />
            Video loop
          </Button>
        </div>
        {(bgType === 'image' || bgType === 'video') && bgName && <p className="truncate text-xs text-muted-foreground">{bgName}</p>}
      </Section>

      {desktop && (
        <Section title={t('recent')}>
          {recent.length === 0 && <p className="text-xs text-muted-foreground">No saved projects yet.</p>}
          <ul className="flex flex-col gap-1">
            {recent.slice(0, 8).map((p) => (
              <li key={p.dir}>
                <button type="button" onClick={() => openProject(p.dir)} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-xs hover:bg-muted">
                  <span className="truncate text-foreground">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">{new Date(p.modified).toLocaleDateString()}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => desktop?.openFolder('Projects')}>
            <FolderOpen className="size-4" aria-hidden />
            {t('openFolder')}
          </Button>
        </Section>
      )}
    </>
  )
}

function ThemeSwatch({ theme, active, onClick }: { theme: Theme; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('flex cursor-pointer flex-col overflow-hidden rounded-md border text-start transition-colors', active ? 'border-primary' : 'border-border hover:border-muted-foreground')}
    >
      <span className="flex h-14 items-center justify-center font-arabic text-xl" style={{ background: `linear-gradient(160deg, ${theme.background}, ${theme.background2})`, color: theme.text, textShadow: `0 0 12px ${theme.glow}` }} lang="ar" dir="rtl">
        ٱلرَّحْمَٰنُ
      </span>
      <span className="flex items-center justify-between gap-1 bg-panel-2 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="truncate">{theme.name}</span>
        {active && <Check className="size-3 text-primary" aria-hidden />}
      </span>
    </button>
  )
}

function ThemesTab() {
  const t = useT()
  const current = useStudio((s) => s.doc.theme)
  const userThemes = useStudio((s) => s.userThemes)
  const update = useStudio((s) => s.update)
  const [name, setName] = useState('')
  const apply = (th: Theme) => update((d) => void (d.theme = { ...th }))

  return (
    <>
      <Section title={t('themes')}>
        <div className="grid grid-cols-2 gap-2">
          {BUILT_IN_THEMES.map((th) => (
            <ThemeSwatch key={th.name} theme={th} active={current.name === th.name} onClick={() => apply(th)} />
          ))}
        </div>
      </Section>
      {userThemes.length > 0 && (
        <Section title="My themes">
          <div className="grid grid-cols-2 gap-2">
            {userThemes.map((th) => (
              <ThemeSwatch key={th.name} theme={th} active={current.name === th.name} onClick={() => apply(th)} />
            ))}
          </div>
        </Section>
      )}
      <Section title={t('saveTheme')}>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) saveCurrentTheme(name.trim())
            setName('')
          }}
        >
          <label htmlFor="theme-name" className="sr-only">
            Theme name
          </label>
          <input id="theme-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Theme name" className="h-8 min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-2 text-sm outline-none focus:border-primary" />
          <Button type="submit" size="sm" variant="primary" disabled={!name.trim()} aria-label={t('saveTheme')}>
            <Save className="size-4" />
          </Button>
        </form>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="outline" onClick={importTheme}>
            <Upload className="size-4" aria-hidden />
            {t('importTheme')}
          </Button>
          <Button size="sm" variant="outline" onClick={exportTheme}>
            <Download className="size-4" aria-hidden />
            {t('exportTheme')}
          </Button>
        </div>
      </Section>
    </>
  )
}

function FontsTab() {
  const t = useT()
  const arabicFont = useStudio((s) => s.doc.style.arabicFont)
  const trFont = useStudio((s) => s.doc.style.translation.font)
  const custom = useStudio((s) => s.customFonts)
  const update = useStudio((s) => s.update)
  const arabicList = [...BUNDLED_FONTS.filter((f) => f.kind === 'arabic').map((f) => f.family), ...custom]
  const trList = [...BUNDLED_FONTS.map((f) => f.family), ...custom]

  return (
    <>
      <Section title="Arabic font">
        <ul className="flex flex-col gap-1.5">
          {arabicList.map((family) => (
            <li key={family}>
              <button
                type="button"
                onClick={() => update((d) => void (d.style.arabicFont = family))}
                aria-pressed={arabicFont === family}
                className={cn('flex w-full cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-start transition-colors', arabicFont === family ? 'border-primary bg-muted' : 'border-border hover:bg-muted')}
              >
                <span className="text-[11px] text-muted-foreground">{family}</span>
                <span className="text-2xl leading-relaxed text-foreground" style={{ fontFamily: `"${family}", serif` }} dir="rtl" lang="ar">
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Translation font">
        <ul className="flex flex-col gap-1">
          {trList.map((family) => (
            <li key={family}>
              <button
                type="button"
                onClick={() => update((d) => void (d.style.translation.font = family))}
                aria-pressed={trFont === family}
                className={cn('flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-start text-sm', trFont === family ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted')}
                style={{ fontFamily: `"${family}", sans-serif` }}
              >
                {family}
                {trFont === family && <Check className="size-3.5 text-primary" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t('addFont')}>
        <p className="text-xs leading-relaxed text-muted-foreground">.ttf · .otf · .woff · .woff2 — {desktop ? 'copied into your Fonts folder and available in every project.' : 'available for this session.'}</p>
        <Button variant="outline" size="sm" onClick={addCustomFont}>
          <Plus className="size-4" aria-hidden />
          {t('addFont')}
        </Button>
      </Section>
    </>
  )
}
