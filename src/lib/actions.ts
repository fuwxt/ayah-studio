/** High-level operations used by the UI (import, align, whisper, online fetch, projects, fonts, themes). */
import { useStudio } from './store'
import { desktop, downloadBlob, pickBrowserFile } from './bridge'
import { audioEngine } from '../engine/audio'
import { alignByEnergy, alignWithRecognized, wordsFromRecognized, type Timed } from './alignment'
import { normalizeForMatch, tokenizeQuranText } from './arabic'
import { ayahAudioUrl, fetchAyahText, fetchSurahPlain, RECITERS } from './quran'
import { concatBuffers, encodeWav } from './wav'
import { defaultDoc } from './presets'
import { registerFontBytes } from './fonts'
import type { ProjectDoc, Theme } from './types'
import { renderStill } from '../engine/exporter'

const S = () => useStudio.getState()

const AUDIO_FILTER = [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus'] }]
const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac' }

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  S().set({ busy: { label } })
  try {
    return await fn()
  } catch (e) {
    S().notify(errMsg(e), 'error')
    return undefined
  } finally {
    S().set({ busy: null })
  }
}

/* ---------------- Audio ---------------- */

export async function loadAudioBytes(data: Uint8Array, name: string, path?: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'mp3'
  const buffer = await audioEngine.load(data, MIME[ext] ?? 'audio/mpeg')
  S().set({ audioInfo: { name, path, duration: buffer.duration }, time: 0 })
  audioEngine.seek(0)
}

export async function importAudio() {
  if (desktop) {
    const f = await desktop.openFile({ title: 'Import recitation audio', filters: AUDIO_FILTER, defaultFolder: 'Audio' })
    if (!f?.data) return
    await withBusy('Decoding audio…', async () => {
      await loadAudioBytes(f.data!, f.name, f.path)
      S().update((d) => {
        d.audio.trimStart = 0
        d.audio.trimEnd = 0
      })
      S().notify(`Loaded ${f.name}`, 'success')
    })
  } else {
    const file = await pickBrowserFile('audio/*')
    if (!file) return
    await withBusy('Decoding audio…', async () => {
      await loadAudioBytes(new Uint8Array(await file.arrayBuffer()), file.name)
      S().notify(`Loaded ${file.name}`, 'success')
    })
  }
}

/* ---------------- Text & alignment ---------------- */

export async function readTextFile(): Promise<string | null> {
  if (desktop) {
    const f = await desktop.openFile({ title: 'Import ayah text', filters: [{ name: 'Text', extensions: ['txt', 'md', 'json'] }], defaultFolder: 'Text' })
    return f?.data ? new TextDecoder('utf-8').decode(f.data) : null
  }
  const file = await pickBrowserFile('.txt,.md,text/plain')
  return file ? file.text() : null
}

function groupWords(doc: ProjectDoc): string[][] {
  const groups: string[][] = []
  for (const w of doc.words) (groups[w.ayahIndex] ??= []).push(w.text)
  return groups.filter(Boolean)
}

function placeholderTimings(ayahs: string[][]): Timed[][] {
  let t = 0.5
  return ayahs.map((words) => {
    const out = words.map(() => {
      const s = { start: +t.toFixed(3), end: +(t + 0.55).toFixed(3) }
      t += 0.6
      return s
    })
    t += 0.6
    return out
  })
}

/** Apply user text exactly as given (diacritics preserved). Translations: one line per ayah. */
export function applyText(raw: string, translationsRaw = '') {
  const ayahs = tokenizeQuranText(raw)
  if (!ayahs.length) {
    S().notify('No Arabic words found in the text.', 'error')
    return
  }
  const translations = translationsRaw.split(/\r?\n/).map((l) => l.trim())
  const prev = S().doc.ayahs
  const timings = audioEngine.energy ? alignByEnergy(ayahs, audioEngine.energy, audioEngine.range().start, audioEngine.range().end) : placeholderTimings(ayahs)
  S().setWords(ayahs, timings, {
    source: 'manual',
    ayahMeta: ayahs.map((_, i) => ({ ayah: prev[i]?.ayah, surah: prev[i]?.surah, translation: translations[i] || undefined })),
  })
  if (!audioEngine.hasAudio) audioEngine.fallbackDuration = Math.max(10, timings.flat().reduce((m, x) => Math.max(m, x.end), 0) + 2)
  S().notify(audioEngine.energy ? `Aligned ${timings.flat().length} words to the recitation.` : 'Text added. Import audio, then run Auto-align.', 'success')
}

export function autoAlign() {
  const doc = S().doc
  if (!audioEngine.energy) return S().notify('Import a recitation first.', 'error')
  if (!doc.words.length) return S().notify('Add ayah text first.', 'error')
  const groups = groupWords(doc)
  const { start, end } = audioEngine.range()
  const timings = alignByEnergy(groups, audioEngine.energy, start, end).flat()
  S().update((d) => {
    d.words.forEach((w, i) => {
      if (timings[i]) {
        w.start = timings[i].start
        w.end = timings[i].end
      }
    })
  })
  S().notify('Words aligned to the recitation. Fine-tune any word on the timeline.', 'success')
}

/* ---------------- Whisper (offline STT) ---------------- */

export async function extractFromAudio(model: string, mode: 'replace' | 'align') {
  const info = S().audioInfo
  if (!desktop) return S().notify('Offline speech-to-text runs in the desktop app.', 'error')
  if (!info?.path) return S().notify('Import a recitation audio file first.', 'error')
  const off = desktop.onWhisperProgress(({ p, msg }) => S().set({ busy: { label: msg, progress: p } }))
  try {
    await withBusy('Starting offline recognition…', async () => {
      const rec = await desktop!.whisperTranscribe({ audioPath: info.path!, model, language: 'ar' })
      if (!rec.length) throw new Error('No speech recognised in the audio.')
      const doc = S().doc
      if (mode === 'align' && doc.words.length) {
        const timings = alignWithRecognized(
          doc.words.map((w) => w.text),
          rec,
        )
        S().update((d) => {
          d.words.forEach((w, i) => {
            w.start = timings[i].start
            w.end = timings[i].end
          })
        })
        S().notify('Your text was aligned using offline speech recognition. Text unchanged.', 'success')
      } else {
        const words = wordsFromRecognized(rec)
        const ayahCount = words.reduce((m, w) => Math.max(m, w.ayahIndex), 0) + 1
        const ayahs: string[][] = Array.from({ length: ayahCount }, () => [])
        const timings: Timed[][] = Array.from({ length: ayahCount }, () => [])
        for (const w of words) {
          ayahs[w.ayahIndex].push(w.text)
          timings[w.ayahIndex].push({ start: w.start, end: w.end })
        }
        S().setWords(ayahs, timings, { source: 'whisper', needsVerification: true })
        S().notify('Text extracted. Please verify every word against the Mushaf.', 'info')
      }
    })
  } finally {
    off()
  }
}

/** Compare the project words with the official Uthmani text of a surah. Returns indices that don't match. */
export async function verifyAgainstQuran(surah: number) {
  return withBusy('Verifying against Quran text…', async () => {
    const official = (await fetchSurahPlain(surah)).join(' ').split(/\s+/).map(normalizeForMatch).filter(Boolean)
    const set = new Set(official)
    const doc = S().doc
    const bad = doc.words.map((w, i) => (set.has(normalizeForMatch(w.text)) ? -1 : i)).filter((i) => i >= 0)
    if (!bad.length) {
      S().update((d) => {
        d.meta.needsVerification = false
      })
      S().notify('All words match the Uthmani text of this surah.', 'success')
    } else {
      S().set({ selection: bad.map((i) => doc.words[i].id) })
      S().notify(`${bad.length} word(s) did not match — they are now selected for review.`, 'error')
    }
    return bad
  })
}

/* ---------------- Online mode ---------------- */

export async function fetchOnline(o: { surah: number; from: number; to: number; reciter: string; translation: string; withAudio: boolean }) {
  await withBusy('Fetching ayahs…', async () => {
    const { ayahs, surahName } = await fetchAyahText(o.surah, o.from, o.to, o.translation)
    const words = ayahs.map((a) => tokenizeQuranText(a.text).flat())
    let spans: Timed[] | undefined

    if (o.withAudio) {
      const ctx = audioEngine.context()
      const parts: AudioBuffer[] = []
      for (let i = 0; i < ayahs.length; i++) {
        S().set({ busy: { label: `Downloading recitation ${i + 1}/${ayahs.length}…`, progress: i / ayahs.length } })
        const res = await fetch(ayahAudioUrl(o.reciter, o.surah, ayahs[i].ayah))
        if (!res.ok) throw new Error(`Audio download failed for ayah ${ayahs[i].ayah}`)
        parts.push(await ctx.decodeAudioData(await res.arrayBuffer()))
      }
      const { buffer, spans: s } = concatBuffers(ctx, parts)
      spans = s
      const wav = encodeWav(buffer)
      const name = `${String(o.surah).padStart(3, '0')}_${o.from}-${o.to}_${o.reciter}.wav`
      const path = desktop ? await desktop.writeCache(name, wav) : undefined
      audioEngine.setBuffer(buffer, new Blob([wav.slice()], { type: 'audio/wav' }))
      S().set({ audioInfo: { name, path, duration: buffer.duration }, time: 0 })
    }

    const timings = audioEngine.energy ? alignByEnergy(words, audioEngine.energy, 0, audioEngine.duration, spans) : placeholderTimings(words)
    S().setWords(words, timings, {
      source: 'online',
      ayahMeta: ayahs.map((a) => ({ surah: a.surah, ayah: a.ayah, translation: a.translation })),
    })
    S().update((d) => {
      d.meta.surahName = surahName
      d.meta.reciter = RECITERS.find((r) => r.id === o.reciter)?.name
      d.audio.trimStart = 0
      d.audio.trimEnd = 0
      if (d.name.startsWith('Untitled')) d.name = `${surahName} ${o.from}-${o.to}`
    })
    S().notify(`Loaded ${surahName} ${o.from}–${o.to}.`, 'success')
  })
}

/* ---------------- Background media ---------------- */

export async function pickBackground(kind: 'image' | 'video') {
  const exts = kind === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'avif'] : ['mp4', 'webm', 'mov', 'm4v']
  let bytes: Uint8Array | null = null
  let name = ''
  let path: string | undefined
  if (desktop) {
    const f = await desktop.openFile({ title: `Choose background ${kind}`, filters: [{ name: kind, extensions: exts }], defaultFolder: 'Backgrounds' })
    if (!f?.data) return
    bytes = f.data
    name = f.name
    path = f.path
  } else {
    const file = await pickBrowserFile(kind === 'image' ? 'image/*' : 'video/*')
    if (!file) return
    bytes = new Uint8Array(await file.arrayBuffer())
    name = file.name
  }
  await setBackgroundBytes(kind, bytes, name, path)
  S().update((d) => {
    d.background.type = kind
    d.background.mediaName = name
  })
}

export async function setBackgroundBytes(kind: 'image' | 'video', bytes: Uint8Array, name: string, path?: string) {
  const prev = S().bgMedia
  if (prev) URL.revokeObjectURL(prev.url)
  const url = URL.createObjectURL(new Blob([bytes.slice()]))
  let el: HTMLImageElement | HTMLVideoElement
  if (kind === 'image') {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    el = img
  } else {
    const v = document.createElement('video')
    v.src = url
    v.muted = true
    v.loop = true
    v.playsInline = true
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve()
      v.onerror = () => reject(new Error(`Could not play ${name}`))
    })
    v.play().catch(() => {})
    el = v
  }
  S().set({ bgMedia: { kind, url, path, el } })
}

/* ---------------- Projects ---------------- */

function mergeDoc(loaded: Partial<ProjectDoc>): ProjectDoc {
  const base = defaultDoc()
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') out[k] = merge(a[k] as Record<string, unknown>, v as Record<string, unknown>)
      else if (v !== undefined) out[k] = v
    }
    return out
  }
  return merge(base as unknown as Record<string, unknown>, loaded as Record<string, unknown>) as unknown as ProjectDoc
}

export async function saveProject(silent = false) {
  const { doc, audioInfo, bgMedia } = S()
  if (!desktop) {
    downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${doc.name}.ayahproj.json`)
    return
  }
  try {
    const r = await desktop.saveProject({ name: doc.name, doc, audioPath: audioInfo?.path, backgroundPath: bgMedia?.path })
    S().set({ projectDir: r.dir, dirty: false, audioInfo: audioInfo ? { ...audioInfo, path: r.audioPath ?? audioInfo.path } : null })
    if (!silent) S().notify(`Saved to ${r.dir}`, 'success')
  } catch (e) {
    if (!silent) S().notify(errMsg(e), 'error')
  }
}

export async function openProject(dir?: string) {
  if (!desktop) {
    const file = await pickBrowserFile('.json,application/json')
    if (!file) return
    S().replaceDoc(mergeDoc(JSON.parse(await file.text())))
    return
  }
  await withBusy('Opening project…', async () => {
    const r = await desktop!.openProject(dir)
    if (!r) return
    const doc = mergeDoc(r.doc as Partial<ProjectDoc>)
    audioEngine.clear()
    S().set({ audioInfo: null, bgMedia: null })
    if (r.audio) await loadAudioBytes(r.audio.data, r.audio.path.split(/[\\/]/).pop()!, r.audio.path)
    if (r.background && (doc.background.type === 'image' || doc.background.type === 'video')) await setBackgroundBytes(doc.background.type, r.background.data, doc.background.mediaName ?? 'background', r.background.path)
    S().replaceDoc(doc)
    S().set({ projectDir: r.dir, dialog: null })
    S().notify(`Opened ${doc.name}`, 'success')
  })
}

export function newProject() {
  audioEngine.clear()
  S().replaceDoc(defaultDoc())
  S().set({ audioInfo: null, bgMedia: null, projectDir: null, time: 0 })
}

/* ---------------- Fonts ---------------- */

export async function addCustomFont() {
  let file: { name: string; data: Uint8Array } | null = null
  if (desktop) {
    const f = await desktop.addFont()
    if (f) file = { name: f.file, data: f.data }
  } else {
    const f = await pickBrowserFile('.ttf,.otf,.woff,.woff2')
    if (f) file = { name: f.name, data: new Uint8Array(await f.arrayBuffer()) }
  }
  if (!file) return null
  try {
    const family = await registerFontBytes(file.name, file.data)
    S().set({ customFonts: [...new Set([...S().customFonts, family])] })
    S().notify(`Font "${family}" added${desktop ? ' to your Fonts folder' : ''}.`, 'success')
    return family
  } catch {
    S().notify('That font file could not be loaded.', 'error')
    return null
  }
}

export async function loadCustomFonts() {
  if (!desktop) return
  const list = await desktop.listFonts()
  const families: string[] = []
  for (const f of list) {
    try {
      families.push(await registerFontBytes(f.file, f.data))
    } catch {
      /* skip broken font files */
    }
  }
  S().set({ customFonts: families })
}

/* ---------------- Themes ---------------- */

const THEME_KEYS: Array<keyof Theme> = ['background', 'background2', 'text', 'pending', 'highlight', 'spoken', 'glow', 'translation', 'rainTint']

function isTheme(x: unknown): x is Theme {
  return !!x && typeof x === 'object' && THEME_KEYS.every((k) => typeof (x as Record<string, unknown>)[k] === 'string')
}

export async function loadUserThemes() {
  if (!desktop) return
  const list = (await desktop.listThemes()).filter(isTheme)
  S().set({ userThemes: list })
}

export async function saveCurrentTheme(name: string) {
  const theme = { ...S().doc.theme, name }
  S().update((d) => {
    d.theme.name = name
  })
  if (desktop) await desktop.saveTheme(theme)
  S().set({ userThemes: [...S().userThemes.filter((t) => t.name !== name), theme] })
  S().notify(`Theme "${name}" saved.`, 'success')
}

export async function importTheme() {
  const text = await (async () => {
    if (desktop) {
      const f = await desktop.openFile({ title: 'Import theme', filters: [{ name: 'Theme', extensions: ['json'] }], defaultFolder: 'Themes' })
      return f?.data ? new TextDecoder().decode(f.data) : null
    }
    const f = await pickBrowserFile('.json')
    return f ? f.text() : null
  })()
  if (!text) return
  try {
    const parsed = JSON.parse(text)
    if (!isTheme(parsed)) throw new Error()
    S().update((d) => {
      d.theme = { ...parsed, name: parsed.name || 'Imported theme' }
    })
    if (desktop) await desktop.saveTheme(parsed)
    S().set({ userThemes: [...S().userThemes.filter((t) => t.name !== parsed.name), parsed] })
    S().notify('Theme imported.', 'success')
  } catch {
    S().notify('Not a valid Ayah Studio theme file.', 'error')
  }
}

export async function exportTheme() {
  const theme = S().doc.theme
  if (desktop) {
    const p = await desktop.exportTheme(theme)
    if (p) S().notify(`Theme exported to ${p}`, 'success')
  } else downloadBlob(new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' }), `${theme.name}.json`)
}

/* ---------------- Still frame ---------------- */

export async function exportThumbnail() {
  const { doc, time, bgMedia } = S()
  const blob = await renderStill(doc, time, bgMedia?.el ?? null)
  if (!blob) return
  if (desktop) {
    const p = await desktop.savePng(`${doc.name}_thumbnail_${Math.round(time * 1000)}`, new Uint8Array(await blob.arrayBuffer()))
    S().set({ lastExport: p })
    S().notify(`Thumbnail saved: ${p}`, 'success')
  } else downloadBlob(blob, `${doc.name}_thumbnail.png`)
}
