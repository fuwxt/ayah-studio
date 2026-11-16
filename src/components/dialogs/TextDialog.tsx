import { useEffect, useState } from 'react'
import { FileUp } from 'lucide-react'
import { useStudio, useT } from '../../lib/store'
import { applyText, readTextFile } from '../../lib/actions'
import { Button, Dialog } from '../ui'

export function TextDialog() {
  const t = useT()
  const open = useStudio((s) => s.dialog === 'text')
  const set = useStudio((s) => s.set)
  const arabicFont = useStudio((s) => s.doc.style.arabicFont)
  const [arabic, setArabic] = useState('')
  const [translation, setTranslation] = useState('')

  useEffect(() => {
    if (!open) return
    const { doc } = useStudio.getState()
    const grouped: string[][] = []
    for (const w of doc.words) (grouped[w.ayahIndex] ??= []).push(w.text)
    setArabic(grouped.filter(Boolean).map((g) => g.join(' ')).join('\n'))
    setTranslation(doc.ayahs.map((a) => a.translation ?? '').join('\n').trim())
  }, [open])

  const close = () => set({ dialog: null })

  return (
    <Dialog
      open={open}
      title={t('editText')}
      onClose={close}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!arabic.trim()}
            onClick={() => {
              applyText(arabic, translation)
              close()
            }}
          >
            Apply text
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
            One ayah per line (or separate ayahs with ۝ / ﴿١﴾ markers). Your text is used exactly as written — diacritics and waqf marks are preserved and never auto-corrected.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const txt = await readTextFile()
              if (txt) setArabic(txt)
            }}
          >
            <FileUp className="size-4" aria-hidden />
            {t('importText')}
          </Button>
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Arabic text
          <textarea
            value={arabic}
            onChange={(e) => setArabic(e.target.value)}
            dir="rtl"
            lang="ar"
            rows={8}
            placeholder="بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"
            className="w-full resize-y rounded-md border border-border bg-panel-2 p-3 text-2xl leading-loose text-foreground outline-none focus:border-primary"
            style={{ fontFamily: `"${arabicFont}", "Amiri Quran", serif` }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Translation (optional — one line per ayah, any language)
          <textarea
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            dir="auto"
            rows={4}
            placeholder="In the name of Allah, the Entirely Merciful, the Especially Merciful."
            className="w-full resize-y rounded-md border border-border bg-panel-2 p-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary"
          />
        </label>
      </div>
    </Dialog>
  )
}
