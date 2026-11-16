/**
 * Secure bridge between the renderer and the main process.
 * Only these whitelisted calls are exposed as window.ayah.
 */
import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('ayah', {
  isDesktop: true,
  appInfo: () => invoke('app:info'),
  saveSettings: (s: unknown) => invoke('settings:save', s),
  changeRoot: () => invoke('settings:changeRoot'),

  openFile: (opts: unknown) => invoke('dialog:openFile', opts),
  readFile: (p: string) => invoke('fs:read', p),
  writeCache: (name: string, data: Uint8Array) => invoke('fs:writeCache', name, data),
  writeText: (folder: string, name: string, text: string) => invoke('fs:writeText', folder, name, text),

  openFolder: (name: string) => invoke('shell:openFolder', name),
  showItem: (p: string) => invoke('shell:showItem', p),
  openExternal: (url: string) => invoke('shell:openExternal', url),

  saveProject: (payload: unknown) => invoke('project:save', payload),
  listProjects: () => invoke('project:list'),
  openProject: (dir?: string) => invoke('project:open', dir),

  addFont: () => invoke('fonts:add'),
  listFonts: () => invoke('fonts:list'),

  listThemes: () => invoke('themes:list'),
  saveTheme: (t: unknown) => invoke('themes:save', t),
  exportTheme: (t: unknown) => invoke('themes:export', t),

  encoders: () => invoke('export:encoders'),
  exportStart: (opts: unknown) => invoke('export:start', opts),
  exportFrame: (id: string, frame: Uint8Array) => invoke('export:frame', id, frame),
  exportFinish: (id: string) => invoke('export:finish', id),
  exportCancel: (id: string) => invoke('export:cancel', id),
  savePng: (name: string, data: Uint8Array) => invoke('export:savePng', name, data),

  whisperStatus: () => invoke('whisper:status'),
  whisperInstallEngine: () => invoke('whisper:installEngine'),
  whisperDownloadModel: (id: string) => invoke('whisper:downloadModel', id),
  whisperTranscribe: (opts: unknown) => invoke('whisper:transcribe', opts),
  onWhisperProgress: (cb: (p: { p: number; msg: string }) => void) => {
    const listener = (_e: unknown, data: { p: number; msg: string }) => cb(data)
    ipcRenderer.on('whisper:progress', listener)
    return () => ipcRenderer.removeListener('whisper:progress', listener)
  },
})
