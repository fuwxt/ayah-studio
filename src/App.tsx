import { useEffect } from 'react'
import { useStudio } from './lib/store'
import { desktop } from './lib/bridge'
import { isRtl } from './lib/i18n'
import { ensureAllFonts } from './lib/fonts'
import { loadCustomFonts, loadUserThemes, saveProject } from './lib/actions'
import { audioEngine } from './engine/audio'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { Preview } from './components/Preview'
import { RightPanel } from './components/RightPanel'
import { Timeline } from './components/Timeline'
import { TextDialog } from './components/dialogs/TextDialog'
import { OnlineDialog } from './components/dialogs/OnlineDialog'
import { SttDialog } from './components/dialogs/SttDialog'
import { ExportDialog } from './components/dialogs/ExportDialog'
import { PublishDialog } from './components/dialogs/PublishDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { Toast, BusyOverlay } from './components/Feedback'

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const s = useStudio.getState()
      if (s.dialog) return
      const mod = e.ctrlKey || e.metaKey
      if (e.code === 'Space') {
        e.preventDefault()
        if (audioEngine.playing) audioEngine.pause()
        else audioEngine.play()
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        s.redo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveProject()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        s.set({ dialog: 'export' })
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const dir = e.key === 'ArrowRight' ? 1 : -1
        if (s.selection.length) {
          const step = (e.shiftKey ? 0.1 : 0.01) * dir
          const sel = new Set(s.selection)
          s.update((d) => {
            for (const w of d.words) {
              if (!sel.has(w.id)) continue
              w.start = Math.max(0, +(w.start + step).toFixed(3))
              w.end = Math.max(w.start + 0.02, +(w.end + step).toFixed(3))
            }
          }, 'nudge')
        } else audioEngine.seek(audioEngine.time + dir * (e.shiftKey ? 5 : 1))
      } else if (e.key === 'Escape') s.set({ selection: [] })
      else if (e.key === 'Home') audioEngine.seek(audioEngine.range().start)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App() {
  const lang = useStudio((s) => s.lang)
  const audioSettings = useStudio((s) => s.doc.audio)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'
    localStorage.setItem('ayah.lang', lang)
  }, [lang])

  useEffect(() => {
    audioEngine.settings = audioSettings
  }, [audioSettings])

  useEffect(() => {
    ensureAllFonts()
    if (!desktop) return
    desktop.appInfo().then((info) => {
      useStudio.setState({ app: info })
      const savedLang = info.settings.lang as string | undefined
      if (savedLang === 'en' || savedLang === 'ur' || savedLang === 'ar') useStudio.setState({ lang: savedLang })
    })
    loadCustomFonts()
    loadUserThemes()
  }, [])

  // Autosave every 60 s while there are unsaved changes (desktop only).
  useEffect(() => {
    if (!desktop) return
    const id = setInterval(() => {
      const s = useStudio.getState()
      if (s.dirty && (s.doc.words.length || s.audioInfo)) saveProject(true)
    }, 60000)
    return () => clearInterval(id)
  }, [])

  useKeyboardShortcuts()

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="flex min-w-0 flex-1 flex-col">
          <Preview />
          <Timeline />
        </main>
        <RightPanel />
      </div>
      <TextDialog />
      <OnlineDialog />
      <SttDialog />
      <ExportDialog />
      <PublishDialog />
      <SettingsDialog />
      <BusyOverlay />
      <Toast />
    </div>
  )
}
