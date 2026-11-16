/**
 * Typed access to the Electron preload bridge (window.ayah).
 * When running in a plain browser (web preview) `desktop` is null and the UI
 * falls back to browser file inputs; export/whisper/filesystem features are desktop-only.
 */
export type FolderName = 'Projects' | 'Audio' | 'Text' | 'Fonts' | 'Themes' | 'Backgrounds' | 'Exports' | 'Cache' | 'Settings'

export interface PickedFile {
  path: string
  name: string
  data: Uint8Array | null
}

export interface AppInfo {
  root: string
  folders: Record<FolderName, string>
  platform: string
  version: string
  settings: Record<string, unknown>
}

export interface WhisperStatus {
  engine: string | null
  models: Array<{ id: string; size: string; installed: boolean }>
  folder: string
}

export interface ExportStartOptions {
  width: number
  height: number
  fps: number
  duration: number
  format: 'mp4' | 'webm' | 'mov' | 'png'
  codec: 'h264' | 'h265' | 'vp9' | 'prores' | 'png'
  quality: number
  hardware: 'auto' | 'cpu'
  withAudio: boolean
  audioPath?: string
  audioStart: number
  audioFadeIn: number
  audioFadeOut: number
  fileBase: string
}

export interface DesktopApi {
  isDesktop: true
  appInfo(): Promise<AppInfo>
  saveSettings(s: Record<string, unknown>): Promise<boolean>
  changeRoot(): Promise<string | null>
  openFile(opts: { title: string; filters: Array<{ name: string; extensions: string[] }>; defaultFolder?: FolderName; readData?: boolean }): Promise<PickedFile | null>
  readFile(p: string): Promise<Uint8Array>
  writeCache(name: string, data: Uint8Array): Promise<string>
  writeText(folder: FolderName, name: string, text: string): Promise<string>
  openFolder(name: FolderName | 'root'): Promise<string>
  showItem(p: string): Promise<void>
  openExternal(url: string): Promise<void>
  saveProject(payload: { name: string; doc: unknown; audioPath?: string; backgroundPath?: string }): Promise<{ dir: string; audioPath?: string }>
  listProjects(): Promise<Array<{ name: string; dir: string; modified: number }>>
  openProject(dir?: string): Promise<{
    dir: string
    doc: Record<string, unknown>
    audio: { path: string; data: Uint8Array } | null
    background: { path: string; data: Uint8Array } | null
  } | null>
  addFont(): Promise<{ file: string; data: Uint8Array } | null>
  listFonts(): Promise<Array<{ file: string; data: Uint8Array }>>
  listThemes(): Promise<unknown[]>
  saveTheme(t: unknown): Promise<string>
  exportTheme(t: unknown): Promise<string | null>
  encoders(): Promise<Record<string, boolean>>
  exportStart(o: ExportStartOptions): Promise<{ id: string; outPath: string; encoder: string }>
  exportFrame(id: string, frame: Uint8Array): Promise<boolean>
  exportFinish(id: string): Promise<string>
  exportCancel(id: string): Promise<void>
  savePng(name: string, data: Uint8Array): Promise<string>
  whisperStatus(): Promise<WhisperStatus>
  whisperInstallEngine(): Promise<WhisperStatus>
  whisperDownloadModel(id: string): Promise<WhisperStatus>
  whisperTranscribe(o: { audioPath: string; model: string; language: string }): Promise<Array<{ text: string; start: number; end: number }>>
  onWhisperProgress(cb: (p: { p: number; msg: string }) => void): () => void
}

declare global {
  interface Window {
    ayah?: DesktopApi
  }
}

export const desktop: DesktopApi | null = typeof window !== 'undefined' && window.ayah ? window.ayah : null

/** Browser fallback: pick a file with a hidden <input type="file">. */
export function pickBrowserFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function openLink(url: string) {
  if (desktop) desktop.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}
