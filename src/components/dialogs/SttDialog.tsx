import { useEffect, useState } from 'react'
import { Download, Cpu, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useStudio, useT } from '../../lib/store'
import { desktop, type WhisperStatus } from '../../lib/bridge'
import { extractFromAudio, verifyAgainstQuran } from '../../lib/actions'
import { SURAH_NAMES } from '../../lib/quran'
import { Button, Dialog, Segmented, Select } from '../ui'

export function SttDialog() {
  const t = useT()
  const open = useStudio((s) => s.dialog === 'stt')
  const set = useStudio((s) => s.set)
  const hasWords = useStudio((s) => s.doc.words.length > 0)
  const audioInfo = useStudio((s) => s.audioInfo)
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [model, setModel] = useState('small')
  const [mode, setMode] = useState<'align' | 'replace'>('align')
  const [progress, setProgress] = useState<{ p: number; msg: string } | null>(null)
  const [verifySurah, setVerifySurah] = useState('1')

  useEffect(() => {
    if (open && desktop) desktop.whisperStatus().then(setStatus)
  }, [open])

  useEffect(() => {
    if (!desktop) return
    return desktop.onWhisperProgress(setProgress)
  }, [])

  const run = async (fn: () => Promise<WhisperStatus>) => {
    try {
      setStatus(await fn())
    } catch (e) {
      useStudio.getState().notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setProgress(null)
    }
  }

  const modelInstalled = status?.models.find((m) => m.id === model)?.installed
  const ready = !!status?.engine && !!modelInstalled && !!audioInfo?.path

  return (
    <Dialog
      open={open}
      title={t('extractFromAudio')}
      onClose={() => set({ dialog: null })}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => set({ dialog: null })}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={async () => {
              set({ dialog: null })
              await extractFromAudio(model, hasWords ? mode : 'replace')
            }}
          >
            <Cpu className="size-4" aria-hidden />
            Run offline recognition
          </Button>
        </>
      }
    >
      {!desktop ? (
        <p className="text-sm text-muted-foreground">Offline speech-to-text uses whisper.cpp and runs in the desktop app. Download Ayah Studio for Windows from the GitHub releases page.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Recognition runs 100% offline on your PC with whisper.cpp. The engine and model are downloaded once into <span className="font-mono text-foreground">Cache/whisper</span>.
          </p>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col">
              <span className="text-sm text-foreground">whisper.cpp engine</span>
              <span className="text-xs text-muted-foreground">{status?.engine ? 'Installed' : 'Not installed'}</span>
            </div>
            {status?.engine ? (
              <CheckCircle2 className="size-5 text-primary" aria-label="Installed" />
            ) : (
              <Button size="sm" variant="outline" disabled={!!progress} onClick={() => run(() => desktop!.whisperInstallEngine())}>
                <Download className="size-4" aria-hidden />
                Install engine
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Model (larger = more accurate, slower)</span>
            {status?.models.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input type="radio" name="whisper-model" checked={model === m.id} onChange={() => setModel(m.id)} className="accent-[var(--primary)]" />
                  {m.id} <span className="text-xs text-muted-foreground">{m.size}</span>
                </label>
                {m.installed ? (
                  <CheckCircle2 className="size-4 text-primary" aria-label="Downloaded" />
                ) : (
                  <Button size="sm" variant="ghost" disabled={!!progress} onClick={() => run(() => desktop!.whisperDownloadModel(m.id))}>
                    <Download className="size-4" aria-hidden />
                    Download
                  </Button>
                )}
              </div>
            ))}
          </div>

          {progress && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-foreground">{progress.msg}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress.p * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
            </div>
          )}

          {hasWords && (
            <Segmented
              label="Mode"
              value={mode}
              options={[
                { value: 'align', label: 'Align my text (keeps text)' },
                { value: 'replace', label: 'Replace text with recognised' },
              ]}
              onChange={setMode}
            />
          )}
          {!audioInfo?.path && <p className="text-xs text-destructive">Import a recitation audio file first.</p>}

          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              Verify against Quran text (online)
            </span>
            <p className="text-xs text-muted-foreground">Compares every word with the official Uthmani text and selects any word that doesn&apos;t match so you can review it.</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select label="Surah" value={verifySurah} options={SURAH_NAMES.map((n, i) => ({ value: String(i + 1), label: `${i + 1}. ${n}` }))} onChange={setVerifySurah} />
              </div>
              <Button size="sm" variant="outline" disabled={!hasWords} onClick={() => verifyAgainstQuran(Number(verifySurah))}>
                Verify
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
