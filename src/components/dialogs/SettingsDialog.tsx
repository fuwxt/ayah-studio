import { FolderOpen, FolderCog, ExternalLink } from 'lucide-react'
import { useStudio, useT } from '../../lib/store'
import { desktop, openLink, type FolderName } from '../../lib/bridge'
import { Button, Dialog } from '../ui'

const FOLDERS: FolderName[] = ['Projects', 'Audio', 'Text', 'Fonts', 'Themes', 'Backgrounds', 'Exports', 'Cache', 'Settings']

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['← / →', 'Nudge selected words 10 ms (Shift 100 ms) · seek 1 s when nothing is selected'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
  ['Ctrl + S', 'Save project'],
  ['Ctrl + E', 'Export'],
  ['Shift / Ctrl + click', 'Multi-select words (preview or timeline)'],
  ['Double-click word', 'Play from that word'],
  ['Esc', 'Clear selection'],
]

export function SettingsDialog() {
  const t = useT()
  const open = useStudio((s) => s.dialog === 'settings')
  const app = useStudio((s) => s.app)
  const set = useStudio((s) => s.set)

  return (
    <Dialog open={open} title={t('settings')} onClose={() => set({ dialog: null })} width="max-w-2xl">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ayah Studio folder</h3>
          {desktop && app ? (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border bg-panel-2 p-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{app.root}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const root = await desktop!.changeRoot()
                    if (root) {
                      const info = await desktop!.appInfo()
                      set({ app: info })
                      useStudio.getState().notify(`Folder moved to ${root}`, 'success')
                    }
                  }}
                >
                  <FolderCog className="size-4" aria-hidden />
                  Change
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {FOLDERS.map((f) => (
                  <Button key={f} size="sm" variant="ghost" className="justify-start" onClick={() => desktop!.openFolder(f)}>
                    <FolderOpen className="size-4" aria-hidden />
                    {f}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">The desktop app creates Documents/AyahStudio with Projects, Audio, Text, Fonts, Themes, Backgrounds, Exports, Cache and Settings folders on first launch.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Keyboard shortcuts</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-foreground">{k}</dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Ayah Studio {app?.version ? `v${app.version}` : ''} · MIT licence · fonts under SIL OFL
          </p>
          <Button size="sm" variant="ghost" onClick={() => openLink('https://github.com/fuwxt/ayah-studio')}>
            <ExternalLink className="size-4" aria-hidden />
            GitHub
          </Button>
        </section>
      </div>
    </Dialog>
  )
}
