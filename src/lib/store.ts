import { create } from 'zustand'
import type { Ayah, ProjectDoc, Theme, Word } from './types'
import { defaultDoc } from './presets'
import type { AppInfo } from './bridge'
import { DICTS, type Lang, type TKey } from './i18n'

export type DialogId = null | 'text' | 'export' | 'online' | 'settings' | 'stt' | 'publish' | 'projects'

export interface BackgroundMedia {
  kind: 'image' | 'video'
  url: string
  path?: string
  el: HTMLImageElement | HTMLVideoElement
}

interface StudioState {
  doc: ProjectDoc
  past: ProjectDoc[]
  future: ProjectDoc[]
  historyKey: string | null
  historyAt: number
  dirty: boolean

  selection: string[]
  time: number
  playing: boolean
  audioInfo: { name: string; path?: string; duration: number } | null
  bgMedia: BackgroundMedia | null
  lang: Lang
  app: AppInfo | null
  customFonts: string[]
  userThemes: Theme[]
  projectDir: string | null
  dialog: DialogId
  toast: { msg: string; kind: 'info' | 'error' | 'success'; id: number } | null
  busy: { label: string; progress?: number } | null
  lastExport: string | null
  timelineZoom: number

  update: (mutator: (d: ProjectDoc) => void, coalesceKey?: string) => void
  /** Push the current doc onto the undo stack (start of a drag). */
  checkpoint: () => void
  /** Mutate without creating undo steps (during a drag, after checkpoint). */
  mutateSilent: (mutator: (d: ProjectDoc) => void) => void
  undo: () => void
  redo: () => void
  replaceDoc: (doc: ProjectDoc) => void
  setWords: (ayahs: string[][], timings: Array<Array<{ start: number; end: number }>>, extra?: { ayahMeta?: Array<Partial<Ayah>>; source?: ProjectDoc['meta']['source']; needsVerification?: boolean }) => void
  set: (partial: Partial<StudioState>) => void
  notify: (msg: string, kind?: 'info' | 'error' | 'success') => void
  t: (key: TKey) => string
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const useStudio = create<StudioState>((set, get) => ({
  doc: defaultDoc(),
  past: [],
  future: [],
  historyKey: null,
  historyAt: 0,
  dirty: false,

  selection: [],
  time: 0,
  playing: false,
  audioInfo: null,
  bgMedia: null,
  lang: (localStorage.getItem('ayah.lang') as Lang) || 'en',
  app: null,
  customFonts: [],
  userThemes: [],
  projectDir: null,
  dialog: null,
  toast: null,
  busy: null,
  lastExport: null,
  timelineZoom: 80,

  update: (mutator, coalesceKey) => {
    const { doc, past, historyKey, historyAt } = get()
    const next = structuredClone(doc)
    mutator(next)
    const now = performance.now()
    // Rapid edits of the same control (slider drags) collapse into one undo step.
    const coalesce = coalesceKey && coalesceKey === historyKey && now - historyAt < 800
    set({
      doc: next,
      past: coalesce ? past : [...past.slice(-149), doc],
      future: [],
      historyKey: coalesceKey ?? null,
      historyAt: now,
      dirty: true,
    })
  },

  checkpoint: () => {
    const { doc, past } = get()
    set({ past: [...past.slice(-149), doc], future: [], historyKey: null })
  },

  mutateSilent: (mutator) => {
    const next = structuredClone(get().doc)
    mutator(next)
    set({ doc: next, dirty: true })
  },

  undo: () => {
    const { past, doc, future } = get()
    if (!past.length) return
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], historyKey: null, dirty: true })
  },

  redo: () => {
    const { past, doc, future } = get()
    if (!future.length) return
    set({ doc: future[0], future: future.slice(1), past: [...past, doc], historyKey: null, dirty: true })
  },

  replaceDoc: (doc) => set({ doc, past: [], future: [], selection: [], historyKey: null, dirty: false }),

  setWords: (ayahs, timings, extra) => {
    get().update((d) => {
      const words: Word[] = []
      ayahs.forEach((list, ai) =>
        list.forEach((text, wi) => {
          const tm = timings[ai]?.[wi] ?? { start: 0, end: 0 }
          words.push({ id: uid(), text, start: tm.start, end: tm.end, ayahIndex: ai })
        }),
      )
      d.words = words
      d.ayahs = ayahs.map((_, i) => ({ id: uid(), ...(extra?.ayahMeta?.[i] ?? {}) }))
      if (extra?.source) d.meta.source = extra.source
      d.meta.needsVerification = !!extra?.needsVerification
    })
    set({ selection: [] })
  },

  set: (partial) => set(partial),

  notify: (msg, kind = 'info') => set({ toast: { msg, kind, id: Date.now() } }),

  t: (key) => DICTS[get().lang][key] ?? DICTS.en[key],
}))

export const useT = () => {
  const lang = useStudio((s) => s.lang)
  return (key: TKey) => DICTS[lang][key] ?? DICTS.en[key]
}
