// Bundles the Electron main + preload processes with esbuild into dist-electron/.
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  external: ['electron'],
  logLevel: 'info',
}

await Promise.all([
  build({ ...shared, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js' }),
  build({ ...shared, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.js' }),
])
