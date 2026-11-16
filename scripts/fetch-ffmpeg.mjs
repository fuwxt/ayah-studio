// Downloads a static FFmpeg build for the target platform into resources/ffmpeg/.
// Usage: node scripts/fetch-ffmpeg.mjs [platform] [arch]
//   platform: win32 | darwin | linux (defaults to the current OS)
//   arch:     x64 | arm64            (defaults to the current CPU)
import { createWriteStream, existsSync, mkdirSync, rmSync, chmodSync, readdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import path from 'node:path'

const RELEASE = 'b6.1.1'
const platform = process.argv[2] || process.platform
const arch = process.argv[3] || process.arch
const outDir = path.resolve('resources/ffmpeg')
const binName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const outFile = path.join(outDir, binName)
const marker = path.join(outDir, `.${platform}-${arch}`)

if (existsSync(outFile) && existsSync(marker)) {
  console.log(`[ffmpeg] already present for ${platform}-${arch}`)
  process.exit(0)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}/ffmpeg-${platform}-${arch}.gz`
console.log(`[ffmpeg] downloading ${url}`)
const res = await fetch(url)
if (!res.ok || !res.body) {
  console.error(`[ffmpeg] download failed: ${res.status} ${res.statusText}`)
  process.exit(1)
}
await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(outFile))
if (platform !== 'win32') chmodSync(outFile, 0o755)
await pipeline(Readable.from(['']), createWriteStream(marker))
console.log(`[ffmpeg] saved ${outFile}`, readdirSync(outDir))
