import { useState } from 'react'
import { useStudio, useT } from '../../lib/store'
import { fetchOnline } from '../../lib/actions'
import { RECITERS, SURAH_AYAH_COUNTS, SURAH_NAMES, TRANSLATIONS } from '../../lib/quran'
import { Button, Dialog, NumberField, Select, Toggle } from '../ui'

export function OnlineDialog() {
  const t = useT()
  const open = useStudio((s) => s.dialog === 'online')
  const set = useStudio((s) => s.set)
  const [surah, setSurah] = useState(1)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(7)
  const [reciter, setReciter] = useState(RECITERS[0].id)
  const [translation, setTranslation] = useState('en.sahih')
  const [withAudio, setWithAudio] = useState(true)
  const max = SURAH_AYAH_COUNTS[surah - 1]
  const valid = from >= 1 && to >= from && to <= max && to - from < 60

  return (
    <Dialog
      open={open}
      title={t('fetchOnline')}
      onClose={() => set({ dialog: null })}
      footer={
        <>
          <Button variant="ghost" onClick={() => set({ dialog: null })}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={async () => {
              set({ dialog: null })
              await fetchOnline({ surah, from, to, reciter, translation, withAudio })
            }}
          >
            Fetch ayahs
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Optional online mode. Uthmani text and translations come from alquran.cloud, recitations from everyayah.com. Each ayah&apos;s audio is joined and the words are aligned automatically. Everything else in Ayah Studio works offline.
        </p>
        <Select
          label="Surah"
          value={String(surah)}
          options={SURAH_NAMES.map((n, i) => ({ value: String(i + 1), label: `${i + 1}. ${n} (${SURAH_AYAH_COUNTS[i]})` }))}
          onChange={(v) => {
            const s = Number(v)
            setSurah(s)
            setFrom(1)
            setTo(Math.min(SURAH_AYAH_COUNTS[s - 1], 7))
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="From ayah" value={from} min={1} max={max} onChange={(v) => setFrom(Math.max(1, Math.min(max, v)))} />
          <NumberField label="To ayah" value={to} min={from} max={max} onChange={(v) => setTo(Math.max(1, Math.min(max, v)))} />
        </div>
        {!valid && <p className="text-xs text-destructive">Choose a range within 1–{max} (up to 60 ayahs at a time).</p>}
        <Toggle label="Download recitation audio" checked={withAudio} onChange={setWithAudio} />
        {withAudio && <Select label="Reciter" value={reciter} options={RECITERS.map((r) => ({ value: r.id, label: r.name }))} onChange={setReciter} />}
        <Select label="Translation" value={translation} options={TRANSLATIONS.map((x) => ({ value: x.id, label: x.name }))} onChange={setTranslation} />
      </div>
    </Dialog>
  )
}
