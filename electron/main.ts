/**
 * Ayah Studio — Electron main process.
 *
 * Responsibilities:
 *  - Create the AyahStudio resource folder tree on first launch
 *  - Settings, projects, themes, fonts (filesystem storage)
 *  - Deterministic export: receive raw RGBA frames from the renderer and pipe them into FFmpeg
 *  - Offline speech-to-text via whisper.cpp (engine + model are downloaded on demand into Cache/)
 */
import { app, BrowserWindow, dialog, ipcMain, shell, Menu, type IpcMainInvokeEvent } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import extractZip from 'extract-zip'

const FOLDERS = ['Projects', 'Audio', 'Text', 'Fonts', 'Themes', 'Backgrounds', 'Exports', 'Cache', 'Settings'] as const
type FolderName = (typeof FOLDERS)[number]

let mainWindow: BrowserWindow | null = null

/* ------------------------------------------------------------------ */
/* Paths & settings                                                     */
/* ------------------------------------------------------------------ */

const bootConfigPath = () => path.join(app.getPath('userData'), 'boot.json')

function readBootConfig(): { rootDir?: string } {
  try {
    return JSON.parse(fs.readFileSync(bootConfigPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeBootConfig(cfg: { rootDir?: string }) {
  fs.mkdirSync(path.dirname(bootConfigPath()), { recursive: true })
  fs.writeFileSync(bootConfigPath(), JSON.stringify(cfg, null, 2))
}

function getRootDir(): string {
  return readBootConfig().rootDir || path.join(app.getPath('documents'), 'AyahStudio')
}

function folder(name: FolderName) {
  return path.join(getRootDir(), name)
}

function ensureFolderTree(root = getRootDir()) {
  for (const f of FOLDERS) fs.mkdirSync(path.join(root, f), { recursive: true })
  const readme = path.join(root, 'README.txt')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      [
        'Ayah Studio resource folder',
        '',
        'Projects/     each project = its own folder (project.json + assets/)',
        'Audio/        recitation audio files',
        'Text/         ayah text files',
        'Fonts/        custom fonts (.ttf .otf .woff .woff2) — auto-registered on launch',
        'Themes/       saved themes (.json)',
        'Backgrounds/  background images and video loops',
        'Exports/      rendered videos ready for TikTok / Instagram / Facebook / YouTube',
        'Cache/        whisper engine + models, temporary files',
        'Settings/     app settings',
      ].join(os.EOL),
    )
  }
}

const settingsPath = () => path.join(folder('Settings'), 'settings.json')

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fsp.readFile(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

/* Files the user explicitly selected through a dialog may be read even if outside the root. */
const userGrantedPaths = new Set<string>()

function assertReadable(p: string) {
  const resolved = path.resolve(p)
  const root = path.resolve(getRootDir())
  if (resolved.startsWith(root + path.sep) || userGrantedPaths.has(resolved)) return resolved
  throw new Error('Access denied: file is outside the Ayah Studio folder and was not selected by the user.')
}

function assertInsideRoot(p: string) {
  const resolved = path.resolve(p)
  const root = path.resolve(getRootDir())
  if (!resolved.startsWith(root + path.sep)) throw new Error('Writes are only allowed inside the Ayah Studio folder.')
  return resolved
}

function safeName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'Untitled'
}

/* ------------------------------------------------------------------ */
/* FFmpeg                                                               */
/* ------------------------------------------------------------------ */

function ffmpegPath(): string {
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = [
    path.join(process.resourcesPath || '', 'ffmpeg', bin),
    path.join(app.getAppPath(), 'resources', 'ffmpeg', bin),
    path.join(process.cwd(), 'resources', 'ffmpeg', bin),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  return bin // fall back to ffmpeg on PATH
}

function runFfmpeg(args: string[], timeoutMs = 20000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = ''
    const proc = spawn(ffmpegPath(), args, { windowsHide: true })
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    proc.stderr.on('data', (d) => (stderr = (stderr + d.toString()).slice(-8000)))
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, stderr: String(e) })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stderr })
    })
  })
}

let encoderCache: Record<string, boolean> | null = null
async function probeEncoders() {
  if (encoderCache) return encoderCache
  const candidates = [
    'libx264',
    'libx265',
    'libvpx-vp9',
    'prores_ks',
    'h264_nvenc',
    'hevc_nvenc',
    'h264_qsv',
    'hevc_qsv',
    'h264_amf',
    'h264_videotoolbox',
    'hevc_videotoolbox',
  ]
  const result: Record<string, boolean> = {}
  await Promise.all(
    candidates.map(async (enc) => {
      const r = await runFfmpeg([
        '-hide_banner',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=256x256:d=0.2',
        '-pix_fmt',
        enc === 'prores_ks' ? 'yuv422p10le' : 'yuv420p',
        '-c:v',
        enc,
        '-f',
        'null',
        '-',
      ])
      result[enc] = r.code === 0
    }),
  )
  encoderCache = result
  return result
}

interface ExportOptions {
  width: number
  height: number
  fps: number
  duration: number
  format: 'mp4' | 'webm' | 'mov' | 'png'
  codec: 'h264' | 'h265' | 'vp9' | 'prores' | 'png'
  quality: number // 0..100
  hardware: 'auto' | 'cpu'
  withAudio: boolean
  audioPath?: string
  audioStart: number
  audioFadeIn: number
  audioFadeOut: number
  fileBase: string
}

interface ExportJob {
  proc: ChildProcessWithoutNullStreams
  outPath: string
  stderr: string
  done: Promise<number>
  cancelled: boolean
}

const jobs = new Map<string, ExportJob>()

async function pickVideoEncoder(o: ExportOptions): Promise<{ name: string; args: string[] }> {
  const enc = await probeEncoders()
  const crf = Math.round(36 - (o.quality / 100) * 22) // 100 → 14, 50 → 25, 0 → 36
  if (o.codec === 'vp9') return { name: 'libvpx-vp9', args: ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'] }
  if (o.codec === 'prores') return { name: 'prores_ks', args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'] }
  if (o.codec === 'png') return { name: 'png', args: [] }

  const hevc = o.codec === 'h265'
  if (o.hardware === 'auto') {
    const hw = hevc
      ? ['hevc_nvenc', 'hevc_qsv', 'hevc_videotoolbox']
      : ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox']
    for (const name of hw) {
      if (!enc[name]) continue
      if (name.endsWith('nvenc')) return { name, args: ['-c:v', name, '-preset', 'p5', '-rc', 'vbr', '-cq', String(crf), '-b:v', '0', '-pix_fmt', 'yuv420p'] }
      if (name.endsWith('qsv')) return { name, args: ['-c:v', name, '-global_quality', String(crf), '-pix_fmt', 'nv12'] }
      if (name.endsWith('amf')) return { name, args: ['-c:v', name, '-quality', 'quality', '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf), '-pix_fmt', 'yuv420p'] }
      if (name.endsWith('videotoolbox')) return { name, args: ['-c:v', name, '-q:v', String(Math.round(o.quality)), '-pix_fmt', 'yuv420p'] }
    }
  }
  if (hevc && enc['libx265'] !== false) return { name: 'libx265', args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(crf), '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p'] }
  return { name: 'libx264', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p'] }
}

async function startExport(o: ExportOptions) {
  const exportsDir = folder('Exports')
  await fsp.mkdir(exportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const base = `${safeName(o.fileBase)}_${o.width}x${o.height}_${stamp}`
  const encoder = await pickVideoEncoder(o)

  const input = ['-y', '-hide_banner', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-r', String(o.fps), '-i', 'pipe:0']
  const useAudio = o.withAudio && !!o.audioPath && o.format !== 'png'
  if (useAudio) {
    input.push('-ss', String(Math.max(0, o.audioStart)), '-t', String(o.duration), '-i', assertReadable(o.audioPath!))
  }

  let outPath: string
  const args = [...input, '-vf', 'vflip', '-map', '0:v']
  if (o.format === 'png') {
    outPath = path.join(exportsDir, base)
    await fsp.mkdir(outPath, { recursive: true })
    args.push(path.join(outPath, 'frame_%05d.png'))
  } else {
    outPath = path.join(exportsDir, `${base}.${o.format}`)
    args.push(...encoder.args)
    if (useAudio) {
      args.push('-map', '1:a')
      const filters: string[] = []
      if (o.audioFadeIn > 0) filters.push(`afade=t=in:st=0:d=${o.audioFadeIn}`)
      if (o.audioFadeOut > 0) filters.push(`afade=t=out:st=${Math.max(0, o.duration - o.audioFadeOut)}:d=${o.audioFadeOut}`)
      if (filters.length) args.push('-af', filters.join(','))
      if (o.format === 'webm') args.push('-c:a', 'libopus', '-b:a', '160k')
      else if (o.format === 'mov') args.push('-c:a', 'pcm_s16le')
      else args.push('-c:a', 'aac', '-b:a', '192k')
    }
    if (o.format === 'mp4') args.push('-movflags', '+faststart')
    args.push('-r', String(o.fps), '-t', String(o.duration), outPath)
  }

  const proc = spawn(ffmpegPath(), args, { windowsHide: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const job: ExportJob = {
    proc,
    outPath,
    stderr: '',
    cancelled: false,
    done: new Promise((resolve) => {
      proc.on('close', (code) => resolve(code ?? -1))
      proc.on('error', () => resolve(-1))
    }),
  }
  proc.stderr.on('data', (d) => (job.stderr = (job.stderr + d.toString()).slice(-6000)))
  proc.stdin.on('error', () => {
    /* surfaced via exit code */
  })
  jobs.set(id, job)
  return { id, outPath, encoder: encoder.name }
}

/* ------------------------------------------------------------------ */
/* Whisper (offline speech-to-text)                                     */
/* ------------------------------------------------------------------ */

const WHISPER_MODELS: Record<string, { file: string; size: string }> = {
  base: { file: 'ggml-base.bin', size: '142 MB' },
  small: { file: 'ggml-small.bin', size: '466 MB' },
  medium: { file: 'ggml-medium.bin', size: '1.5 GB' },
  'large-v3-turbo': { file: 'ggml-large-v3-turbo.bin', size: '1.6 GB' },
}

const whisperDir = () => path.join(folder('Cache'), 'whisper')

function findFile(dir: string, names: string[]): string | null {
  if (!fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, names)
      if (found) return found
    } else if (names.includes(entry.name)) return full
  }
  return null
}

function whisperBinary() {
  const exe = process.platform === 'win32' ? ['whisper-cli.exe', 'main.exe'] : ['whisper-cli', 'main']
  return findFile(path.join(whisperDir(), 'engine'), exe)
}

function whisperStatus() {
  const models = Object.entries(WHISPER_MODELS).map(([id, m]) => ({
    id,
    size: m.size,
    installed: fs.existsSync(path.join(whisperDir(), 'models', m.file)),
  }))
  return { engine: whisperBinary(), models, folder: whisperDir() }
}

async function download(url: string, dest: string, onProgress: (p: number) => void) {
  const res = await fetch(url, { headers: { 'User-Agent': 'AyahStudio' } })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) ${url}`)
  const total = Number(res.headers.get('content-length') || 0)
  let received = 0
  const tmp = `${dest}.part`
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  const reader = Readable.fromWeb(res.body as never)
  reader.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (total) onProgress(received / total)
  })
  await pipeline(reader, fs.createWriteStream(tmp))
  await fsp.rename(tmp, dest)
}

async function installWhisperEngine(send: (p: number, msg: string) => void) {
  const assetPattern =
    process.platform === 'win32'
      ? /^whisper-bin-x64\.zip$/
      : process.platform === 'linux'
        ? /^whisper-bin-ubuntu-x64\.tar\.gz$/
        : null
  if (!assetPattern) throw new Error('Automatic engine install is available on Windows and Linux. On macOS run: brew install whisper-cpp, then copy whisper-cli into Cache/whisper/engine/.')
  send(0, 'Finding latest whisper.cpp release…')
  const rels = (await (await fetch('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=15', { headers: { 'User-Agent': 'AyahStudio' } })).json()) as Array<{
    tag_name: string
    assets: Array<{ name: string; browser_download_url: string }>
  }>
  const asset = rels.flatMap((r) => r.assets).find((a) => assetPattern.test(a.name))
  if (!asset) throw new Error('Could not find a whisper.cpp binary for this platform.')
  const archive = path.join(whisperDir(), asset.name)
  await download(asset.browser_download_url, archive, (p) => send(p * 0.9, `Downloading engine (${asset.name})`))
  const engineDir = path.join(whisperDir(), 'engine')
  await fsp.rm(engineDir, { recursive: true, force: true })
  await fsp.mkdir(engineDir, { recursive: true })
  send(0.95, 'Extracting…')
  if (asset.name.endsWith('.zip')) await extractZip(archive, { dir: engineDir })
  else {
    const r = await new Promise<number>((resolve) => spawn('tar', ['-xzf', archive, '-C', engineDir]).on('close', (c) => resolve(c ?? 1)))
    if (r !== 0) throw new Error('Failed to extract engine archive')
    const bin = whisperBinary()
    if (bin) await fsp.chmod(bin, 0o755)
  }
  await fsp.rm(archive, { force: true })
  send(1, 'Engine installed')
}

async function transcribe(event: IpcMainInvokeEvent, opts: { audioPath: string; model: string; language: string }) {
  const bin = whisperBinary()
  if (!bin) throw new Error('Whisper engine is not installed. Open Settings → Offline speech-to-text and install it.')
  const model = WHISPER_MODELS[opts.model]
  const modelPath = model && path.join(whisperDir(), 'models', model.file)
  if (!modelPath || !fs.existsSync(modelPath)) throw new Error(`Whisper model "${opts.model}" is not downloaded yet.`)

  const progress = (p: number, msg: string) => event.sender.send('whisper:progress', { p, msg })
  const tmpBase = path.join(folder('Cache'), `stt-${Date.now()}`)
  const wav = `${tmpBase}.wav`
  progress(0.02, 'Converting audio to 16 kHz mono…')
  const conv = await runFfmpeg(['-y', '-i', assertReadable(opts.audioPath), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], 120000)
  if (conv.code !== 0) throw new Error(`Audio conversion failed: ${conv.stderr.slice(-400)}`)

  progress(0.05, 'Recognising speech offline…')
  const threads = Math.max(2, Math.min(8, os.cpus().length - 1))
  const args = ['-m', modelPath, '-f', wav, '-l', opts.language || 'ar', '-ml', '1', '-sow', '-oj', '-of', tmpBase, '-t', String(threads), '-pp']
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true, cwd: path.dirname(bin) })
    let err = ''
    const onData = (d: Buffer) => {
      const s = d.toString()
      err = (err + s).slice(-4000)
      const m = s.match(/progress\s*=\s*(\d+)%/)
      if (m) progress(0.05 + (Number(m[1]) / 100) * 0.9, `Recognising speech… ${m[1]}%`)
    }
    proc.stderr.on('data', onData)
    proc.stdout.on('data', onData)
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`whisper exited with ${code}: ${err.slice(-500)}`))))
  })

  const json = JSON.parse(await fsp.readFile(`${tmpBase}.json`, 'utf8')) as {
    transcription: Array<{ offsets: { from: number; to: number }; text: string }>
  }
  await Promise.all([fsp.rm(wav, { force: true }), fsp.rm(`${tmpBase}.json`, { force: true })])
  progress(1, 'Done')
  return json.transcription
    .map((s) => ({ text: s.text.trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 }))
    .filter((w) => w.text && !/^\[.*\]$/.test(w.text))
}

/* ------------------------------------------------------------------ */
/* IPC                                                                  */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('app:info', async () => {
    ensureFolderTree()
    return {
      root: getRootDir(),
      folders: Object.fromEntries(FOLDERS.map((f) => [f, folder(f)])),
      platform: process.platform,
      version: app.getVersion(),
      settings: await readSettings(),
    }
  })

  ipcMain.handle('settings:save', async (_e, settings: Record<string, unknown>) => {
    await fsp.writeFile(settingsPath(), JSON.stringify(settings, null, 2))
    return true
  })

  ipcMain.handle('settings:changeRoot', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { title: 'Choose Ayah Studio folder location', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const root = path.join(r.filePaths[0], 'AyahStudio')
    ensureFolderTree(root)
    writeBootConfig({ ...readBootConfig(), rootDir: root })
    return root
  })

  ipcMain.handle('dialog:openFile', async (_e, opts: { title: string; filters: Electron.FileFilter[]; defaultFolder?: FolderName; readData?: boolean }) => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: opts.title,
      filters: opts.filters,
      defaultPath: opts.defaultFolder ? folder(opts.defaultFolder) : undefined,
      properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths[0]) return null
    const p = path.resolve(r.filePaths[0])
    userGrantedPaths.add(p)
    const data = opts.readData === false ? null : await fsp.readFile(p)
    return { path: p, name: path.basename(p), data }
  })

  ipcMain.handle('fs:read', async (_e, p: string) => fsp.readFile(assertReadable(p)))

  ipcMain.handle('fs:writeCache', async (_e, name: string, data: Uint8Array) => {
    const p = assertInsideRoot(path.join(folder('Cache'), safeName(name)))
    await fsp.writeFile(p, data)
    return p
  })

  ipcMain.handle('fs:writeText', async (_e, sub: FolderName, name: string, text: string) => {
    const p = assertInsideRoot(path.join(folder(sub), safeName(name)))
    await fsp.writeFile(p, text, 'utf8')
    return p
  })

  ipcMain.handle('shell:openFolder', async (_e, name: FolderName | 'root') => shell.openPath(name === 'root' ? getRootDir() : folder(name)))
  ipcMain.handle('shell:showItem', async (_e, p: string) => shell.showItemInFolder(path.resolve(p)))
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (!/^https:\/\//.test(url)) throw new Error('Only https links can be opened')
    await shell.openExternal(url)
  })

  /* Projects ------------------------------------------------------- */
  ipcMain.handle('project:save', async (_e, payload: { name: string; doc: Record<string, unknown>; audioPath?: string; backgroundPath?: string }) => {
    const dir = path.join(folder('Projects'), safeName(payload.name))
    const assets = path.join(dir, 'assets')
    await fsp.mkdir(assets, { recursive: true })
    const doc: Record<string, unknown> = { ...payload.doc, savedAt: new Date().toISOString(), app: 'Ayah Studio', formatVersion: 1 }
    const copyAsset = async (src: string | undefined, key: 'audioRel' | 'backgroundRel') => {
      if (!src) return
      const resolved = assertReadable(src)
      const target = path.join(assets, path.basename(resolved))
      if (path.resolve(target) !== resolved) await fsp.copyFile(resolved, target)
      ;(doc as Record<string, unknown>)[key] = path.posix.join('assets', path.basename(resolved))
    }
    await copyAsset(payload.audioPath, 'audioRel')
    await copyAsset(payload.backgroundPath, 'backgroundRel')
    await fsp.writeFile(path.join(dir, 'project.json'), JSON.stringify(doc, null, 2))
    return { dir, audioPath: doc.audioRel ? path.join(dir, String(doc.audioRel)) : undefined }
  })

  ipcMain.handle('project:list', async () => {
    const dir = folder('Projects')
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    const list = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const pj = path.join(dir, e.name, 'project.json')
          const st = await fsp.stat(pj).catch(() => null)
          return st ? { name: e.name, dir: path.join(dir, e.name), modified: st.mtimeMs } : null
        }),
    )
    return list.filter(Boolean).sort((a, b) => b!.modified - a!.modified)
  })

  ipcMain.handle('project:open', async (_e, dir?: string) => {
    let projectDir = dir
    if (!projectDir) {
      const r = await dialog.showOpenDialog(mainWindow!, {
        title: 'Open Ayah Studio project',
        defaultPath: folder('Projects'),
        filters: [{ name: 'Ayah Studio project', extensions: ['json', 'ayahproj'] }],
        properties: ['openFile'],
      })
      if (r.canceled || !r.filePaths[0]) return null
      projectDir = path.dirname(r.filePaths[0])
      userGrantedPaths.add(path.resolve(r.filePaths[0]))
    }
    const pjPath = path.join(projectDir, 'project.json')
    const doc = JSON.parse(await fsp.readFile(pjPath, 'utf8'))
    const resolveAsset = async (rel?: string) => {
      if (!rel) return null
      const abs = path.resolve(projectDir!, rel)
      userGrantedPaths.add(abs)
      return fs.existsSync(abs) ? { path: abs, data: await fsp.readFile(abs) } : null
    }
    return { dir: projectDir, doc, audio: await resolveAsset(doc.audioRel), background: await resolveAsset(doc.backgroundRel) }
  })

  /* Fonts ---------------------------------------------------------- */
  ipcMain.handle('fonts:add', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add custom font',
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
      properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths[0]) return null
    const src = r.filePaths[0]
    const dest = path.join(folder('Fonts'), path.basename(src))
    await fsp.copyFile(src, dest)
    return { file: path.basename(dest), data: await fsp.readFile(dest) }
  })

  ipcMain.handle('fonts:list', async () => {
    const dir = folder('Fonts')
    const files = (await fsp.readdir(dir).catch(() => [])).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))
    return Promise.all(files.map(async (file) => ({ file, data: await fsp.readFile(path.join(dir, file)) })))
  })

  /* Themes --------------------------------------------------------- */
  ipcMain.handle('themes:list', async () => {
    const dir = folder('Themes')
    const files = (await fsp.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'))
    const out = []
    for (const f of files) {
      try {
        out.push(JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')))
      } catch {
        /* skip invalid theme files */
      }
    }
    return out
  })

  ipcMain.handle('themes:save', async (_e, theme: { name: string }) => {
    const p = path.join(folder('Themes'), `${safeName(theme.name)}.json`)
    await fsp.writeFile(p, JSON.stringify(theme, null, 2))
    return p
  })

  ipcMain.handle('themes:export', async (_e, theme: { name: string }) => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export theme',
      defaultPath: path.join(folder('Themes'), `${safeName(theme.name)}.json`),
      filters: [{ name: 'Theme', extensions: ['json'] }],
    })
    if (r.canceled || !r.filePath) return null
    await fsp.writeFile(r.filePath, JSON.stringify(theme, null, 2))
    return r.filePath
  })

  /* Export --------------------------------------------------------- */
  ipcMain.handle('export:encoders', async () => probeEncoders())
  ipcMain.handle('export:start', async (_e, opts: ExportOptions) => startExport(opts))

  ipcMain.handle('export:frame', async (_e, id: string, frame: Uint8Array) => {
    const job = jobs.get(id)
    if (!job || job.cancelled) return false
    if (job.proc.exitCode !== null) throw new Error(`FFmpeg stopped unexpectedly: ${job.stderr.slice(-600)}`)
    const ok = job.proc.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength))
    if (!ok) await new Promise<void>((resolve) => job.proc.stdin.once('drain', () => resolve()))
    return true
  })

  ipcMain.handle('export:finish', async (_e, id: string) => {
    const job = jobs.get(id)
    if (!job) throw new Error('Unknown export job')
    job.proc.stdin.end()
    const code = await job.done
    jobs.delete(id)
    if (code !== 0) throw new Error(`FFmpeg failed (code ${code}): ${job.stderr.slice(-800)}`)
    return job.outPath
  })

  ipcMain.handle('export:cancel', async (_e, id: string) => {
    const job = jobs.get(id)
    if (!job) return
    job.cancelled = true
    job.proc.kill('SIGKILL')
    await job.done
    jobs.delete(id)
    await fsp.rm(job.outPath, { recursive: true, force: true }).catch(() => {})
  })

  ipcMain.handle('export:savePng', async (_e, name: string, data: Uint8Array) => {
    const p = path.join(folder('Exports'), `${safeName(name)}.png`)
    await fsp.writeFile(p, data)
    return p
  })

  /* Whisper -------------------------------------------------------- */
  ipcMain.handle('whisper:status', async () => whisperStatus())
  ipcMain.handle('whisper:installEngine', async (e) => {
    await installWhisperEngine((p, msg) => e.sender.send('whisper:progress', { p, msg }))
    return whisperStatus()
  })
  ipcMain.handle('whisper:downloadModel', async (e, id: string) => {
    const m = WHISPER_MODELS[id]
    if (!m) throw new Error('Unknown model')
    await download(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.file}`, path.join(whisperDir(), 'models', m.file), (p) =>
      e.sender.send('whisper:progress', { p, msg: `Downloading ${m.file} (${m.size})` }),
    )
    return whisperStatus()
  })
  ipcMain.handle('whisper:transcribe', transcribe)
}

/* ------------------------------------------------------------------ */
/* Window                                                               */
/* ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0b0d10',
    title: 'Ayah Studio',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  ensureFolderTree()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const job of jobs.values()) job.proc.kill('SIGKILL')
  if (process.platform !== 'darwin') app.quit()
})
