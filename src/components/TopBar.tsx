import { FilePlus2, FolderOpen, Save, Undo2, Redo2, Settings, Download, Share2, Languages } from 'lucide-react'
import { useStudio, useT } from '../lib/store'
import { newProject, openProject, saveProject } from '../lib/actions'
import { desktop } from '../lib/bridge'
import type { Lang } from '../lib/i18n'
import { Button } from './ui'

export function TopBar() {
  const t = useT()
  const name = useStudio((s) => s.doc.name)
  const dirty = useStudio((s) => s.dirty)
  const canUndo = useStudio((s) => s.past.length > 0)
  const canRedo = useStudio((s) => s.future.length > 0)
  const lang = useStudio((s) => s.lang)
  const { update, undo, redo, set } = useStudio.getState()

  const changeLang = (l: Lang) => {
    set({ lang: l })
    const app = useStudio.getState().app
    if (desktop && app) desktop.saveSettings({ ...app.settings, lang: l })
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
      <div className="flex items-center gap-2 pe-2">
        <img src="./icon.png" alt="" className="size-7 rounded-md" />
        <span className="text-sm font-semibold tracking-tight text-foreground">{t('appName')}</span>
      </div>

      <div className="flex items-center gap-1 border-s border-border ps-2">
        <Button variant="ghost" size="sm" onClick={() => newProject()} title="New project">
          <FilePlus2 className="size-4" aria-hidden />
          <span className="hidden xl:inline">{t('newProject')}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openProject()} title="Open project">
          <FolderOpen className="size-4" aria-hidden />
          <span className="hidden xl:inline">{t('open')}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => saveProject()} title="Save (Ctrl+S)">
          <Save className="size-4" aria-hidden />
          <span className="hidden xl:inline">{t('save')}</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} aria-label={t('undo')} title="Undo (Ctrl+Z)">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo} aria-label={t('redo')} title="Redo (Ctrl+Y)">
          <Redo2 className="size-4" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <label className="sr-only" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => update((d) => void (d.name = e.target.value), 'name')}
          className="w-full max-w-sm truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-sm text-foreground outline-none hover:border-border focus:border-primary"
        />
        {dirty && <span className="sr-only">Unsaved changes</span>}
        {dirty && <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden title="Unsaved changes" />}
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Languages className="size-4" aria-hidden />
          <label htmlFor="ui-lang" className="sr-only">
            {t('language')}
          </label>
          <select id="ui-lang" value={lang} onChange={(e) => changeLang(e.target.value as Lang)} className="h-7 rounded-md border border-border bg-panel-2 px-1.5 text-xs text-foreground outline-none">
            <option value="en">English</option>
            <option value="ur">اردو</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <Button variant="ghost" size="icon" onClick={() => set({ dialog: 'settings' })} aria-label={t('settings')}>
          <Settings className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => set({ dialog: 'publish' })}>
          <Share2 className="size-4" aria-hidden />
          <span className="hidden lg:inline">{t('publish')}</span>
        </Button>
        <Button variant="primary" size="sm" onClick={() => set({ dialog: 'export' })} title="Export (Ctrl+E)">
          <Download className="size-4" aria-hidden />
          {t('export')}
        </Button>
      </div>
    </header>
  )
}
