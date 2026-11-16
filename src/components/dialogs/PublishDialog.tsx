import { useEffect, useState } from 'react'
import { Copy, ExternalLink, FolderOpen, Check } from 'lucide-react'
import { useStudio, useT } from '../../lib/store'
import { desktop, openLink } from '../../lib/bridge'
import { PLATFORMS } from '../../lib/presets'
import { Button, Dialog } from '../ui'

function buildCaption(surah?: string, from?: number, to?: number, reciter?: string, translation?: string) {
  const ref = surah ? `Surah ${surah}${from ? ` · Ayah ${from}${to && to !== from ? `–${to}` : ''}` : ''}` : 'Quran recitation'
  const lines = [`${ref} ✨`, reciter ? `Recitation: ${reciter}` : '', translation ? `"${translation}"` : '', '', '#Quran #Tilawat #QuranRecitation #Islam #QuranReels #Allah #Muslim #تلاوة #القرآن_الكريم']
  return lines.filter((l, i) => l || i === 3).join('\n')
}

export function PublishDialog() {
  const t = useT()
  const open = useStudio((s) => s.dialog === 'publish')
  const set = useStudio((s) => s.set)
  const lastExport = useStudio((s) => s.lastExport)
  const [caption, setCaption] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const { doc } = useStudio.getState()
    const ayahNums = doc.ayahs.map((a) => a.ayah).filter((n): n is number => typeof n === 'number')
    setCaption(buildCaption(doc.meta.surahName, ayahNums[0], ayahNums[ayahNums.length - 1], doc.meta.reciter, doc.ayahs[0]?.translation))
    setCopied(false)
  }, [open])

  const copy = async () => {
    await navigator.clipboard.writeText(caption)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} title={t('publish')} onClose={() => set({ dialog: null })} width="max-w-xl">
      <div className="flex flex-col gap-5">
        <ol className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
          <li>1. Export your reel (9:16, 1080×1920, 30 fps is ideal for all four platforms).</li>
          <li>2. Copy the caption below.</li>
          <li>3. Open a platform, choose the exported video from your Exports folder and post.</li>
        </ol>

        {lastExport ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-panel-2 p-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{lastExport}</span>
            {desktop && (
              <Button size="sm" variant="ghost" onClick={() => desktop!.showItem(lastExport)}>
                <FolderOpen className="size-4" aria-hidden />
                Show file
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 p-3">
            <p className="text-xs text-foreground">No video exported yet in this session.</p>
            <Button size="sm" variant="primary" onClick={() => set({ dialog: 'export' })}>
              {t('export')}
            </Button>
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Caption & hashtags
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} dir="auto" className="resize-y rounded-md border border-border bg-panel-2 p-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary" />
        </label>
        <Button variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy caption'}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map((p) => (
            <Button key={p.id} variant="default" className="h-11 justify-between" onClick={() => openLink(p.url)}>
              <span>{p.name}</span>
              <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
            </Button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Uploads use each platform&apos;s official upload page in your browser, so your accounts and passwords never pass through Ayah Studio.</p>
      </div>
    </Dialog>
  )
}
