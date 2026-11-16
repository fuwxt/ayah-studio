import '@fontsource/amiri-quran/400.css'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'
import '@fontsource/scheherazade-new/400.css'
import '@fontsource/scheherazade-new/700.css'
import '@fontsource/noto-naskh-arabic/400.css'
import '@fontsource/noto-naskh-arabic/700.css'
import '@fontsource/noto-kufi-arabic/400.css'
import '@fontsource/noto-kufi-arabic/700.css'
import '@fontsource/lateef/400.css'
import '@fontsource/reem-kufi/400.css'
import '@fontsource/reem-kufi/700.css'
import '@fontsource/noto-nastaliq-urdu/400.css'
import '@fontsource-variable/inter'

export interface FontEntry {
  family: string
  label: string
  kind: 'arabic' | 'latin' | 'urdu'
  custom?: boolean
}

/** All bundled fonts are SIL Open Font License — free to embed and redistribute. */
export const BUNDLED_FONTS: FontEntry[] = [
  { family: 'Amiri Quran', label: 'Amiri Quran', kind: 'arabic' },
  { family: 'Amiri', label: 'Amiri', kind: 'arabic' },
  { family: 'Scheherazade New', label: 'Scheherazade New', kind: 'arabic' },
  { family: 'Noto Naskh Arabic', label: 'Noto Naskh Arabic', kind: 'arabic' },
  { family: 'Noto Kufi Arabic', label: 'Noto Kufi Arabic', kind: 'arabic' },
  { family: 'Lateef', label: 'Lateef', kind: 'arabic' },
  { family: 'Reem Kufi', label: 'Reem Kufi', kind: 'arabic' },
  { family: 'Noto Nastaliq Urdu', label: 'Noto Nastaliq Urdu', kind: 'urdu' },
  { family: 'Inter Variable', label: 'Inter', kind: 'latin' },
]

const SAMPLE = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ abc'

/** Make sure a font face is decoded before drawing to canvas (canvas never waits for fonts). */
export async function ensureFont(family: string, weight = 400) {
  try {
    await document.fonts.load(`${weight} 48px "${family}"`, SAMPLE)
  } catch {
    /* fall back silently to the next font in the stack */
  }
}

export async function ensureAllFonts() {
  await Promise.all(BUNDLED_FONTS.map((f) => ensureFont(f.family)))
}

/** Register a font from raw bytes (custom fonts from the Fonts/ folder). Returns the family name. */
export async function registerFontBytes(fileName: string, data: ArrayBuffer | Uint8Array): Promise<string> {
  const family = fileName.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim()
  const buf = data instanceof Uint8Array ? data.slice().buffer : data
  const face = new FontFace(family, buf)
  await face.load()
  document.fonts.add(face)
  return family
}
