/**
 * Arabic text layout.
 * Words are laid out right-to-left, wrapped to the configured max width and grouped into
 * "screens" (an ayah, or a chunk of an ayah when it exceeds maxLines). The browser's text
 * engine (HarfBuzz in Chromium) shapes every word, so ligatures and tashkeel render correctly.
 * Words are separated by spaces in Arabic script, so drawing them individually keeps joining intact.
 */
import type { ProjectDoc } from '../lib/types'
import { hasArabic, toArabicDigits } from '../lib/arabic'

export interface LaidItem {
  wordIndex: number // index into doc.words, or -1 for an ayah-number marker
  text: string
  cx: number
  cy: number
  w: number
  ayahIndex: number
  markerOf?: number // last word index of the ayah this marker belongs to
}

export interface ScreenLayout {
  items: LaidItem[]
  firstWord: number
  lastWord: number
  ayahIndex: number
  translation: { lines: string[]; x: number; y0: number; lineH: number; font: string; dir: 'ltr' | 'rtl'; align: CanvasTextAlign } | null
}

export interface LayoutMetrics {
  scale: number
  fontPx: number
  font: string
}

export function arabicFont(doc: ProjectDoc, px: number) {
  return `${doc.style.arabicWeight} ${px}px "${doc.style.arabicFont}", "Amiri Quran", "Noto Naskh Arabic", serif`
}

export function translationFont(doc: ProjectDoc, px: number) {
  const t = doc.style.translation
  return `${t.weight} ${px}px "${t.font}", "Inter Variable", "Noto Nastaliq Urdu", "Noto Naskh Arabic", sans-serif`
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

export function computeLayout(doc: ProjectDoc, W: number, H: number, ctx: CanvasRenderingContext2D): { screens: ScreenLayout[]; metrics: LayoutMetrics } {
  const s = doc.style
  const scale = Math.min(W, H) / 1080
  const fontPx = s.arabicSize * scale
  const font = arabicFont(doc, fontPx)
  const lineH = fontPx * s.lineHeight
  const space = fontPx * s.wordSpacing
  const maxW = W * s.maxWidth
  const screens: ScreenLayout[] = []

  ctx.save()
  ctx.direction = 'rtl'
  ctx.font = font

  // group word indices by ayah, preserving order
  const byAyah = new Map<number, number[]>()
  doc.words.forEach((w, i) => {
    if (!byAyah.has(w.ayahIndex)) byAyah.set(w.ayahIndex, [])
    byAyah.get(w.ayahIndex)!.push(i)
  })

  const tFontPx = s.translation.size * scale
  const tFont = translationFont(doc, tFontPx)
  const tLineH = tFontPx * s.translation.lineHeight

  for (const [ayahIndex, indices] of [...byAyah.entries()].sort((a, b) => a[0] - b[0])) {
    type Tok = { wordIndex: number; text: string; w: number; markerOf?: number }
    const toks: Tok[] = indices.map((i) => ({ wordIndex: i, text: doc.words[i].text, w: ctx.measureText(doc.words[i].text).width }))
    if (s.showAyahNumber) {
      const num = doc.ayahs[ayahIndex]?.ayah ?? ayahIndex + 1
      const text = `\u06DD${toArabicDigits(num)}`
      toks.push({ wordIndex: -1, text, w: ctx.measureText(text).width, markerOf: indices[indices.length - 1] })
    }

    // wrap
    const lines: Tok[][] = []
    let cur: Tok[] = []
    let curW = 0
    for (const tok of toks) {
      const add = (cur.length ? space : 0) + tok.w
      if (cur.length && curW + add > maxW && tok.wordIndex !== -1) {
        lines.push(cur)
        cur = [tok]
        curW = tok.w
      } else {
        cur.push(tok)
        curW += add
      }
    }
    if (cur.length) lines.push(cur)

    // translation (shown with every screen of this ayah)
    const trText = s.translation.enabled ? doc.ayahs[ayahIndex]?.translation?.trim() : ''
    let trLines: string[] = []
    let trDir: 'ltr' | 'rtl' = 'ltr'
    if (trText) {
      trDir = s.translation.direction === 'auto' ? (hasArabic(trText) ? 'rtl' : 'ltr') : s.translation.direction
      ctx.font = tFont
      ctx.direction = trDir
      trLines = wrapText(ctx, trText, W * s.translation.maxWidth)
      ctx.font = font
      ctx.direction = 'rtl'
    }

    const perScreen = Math.max(1, s.maxLines)
    for (let li = 0; li < lines.length; li += perScreen) {
      const chunk = lines.slice(li, li + perScreen)
      const textH = chunk.length * lineH
      const trH = trLines.length ? s.translation.gap * scale + trLines.length * tLineH : 0
      const blockH = textH + trH
      const margin = H * 0.06
      const top = Math.min(H - margin - blockH, Math.max(margin, H * s.verticalPosition - blockH / 2))

      const items: LaidItem[] = []
      chunk.forEach((line, i) => {
        const lineW = line.reduce((a, t, k) => a + t.w + (k ? space : 0), 0)
        let right: number
        if (s.align === 'right') right = (W + maxW) / 2
        else if (s.align === 'left') right = (W - maxW) / 2 + lineW
        else right = (W + lineW) / 2
        const cy = top + lineH * (i + 0.5)
        for (const t of line) {
          items.push({ wordIndex: t.wordIndex, text: t.text, cx: right - t.w / 2, cy, w: t.w, ayahIndex, markerOf: t.markerOf })
          right -= t.w + space
        }
      })

      const wordItems = items.filter((it) => it.wordIndex >= 0)
      const tAlign: CanvasTextAlign = s.align === 'center' ? 'center' : trDir === 'rtl' ? (s.align === 'right' ? 'right' : 'left') : s.align === 'right' ? 'right' : 'left'
      const tX = s.align === 'center' ? W / 2 : s.align === 'right' ? (W + W * s.translation.maxWidth) / 2 : (W - W * s.translation.maxWidth) / 2
      screens.push({
        items,
        firstWord: wordItems[0]?.wordIndex ?? 0,
        lastWord: wordItems[wordItems.length - 1]?.wordIndex ?? 0,
        ayahIndex,
        translation: trLines.length
          ? { lines: trLines, x: tX, y0: top + textH + s.translation.gap * scale + tLineH / 2, lineH: tLineH, font: tFont, dir: trDir, align: tAlign }
          : null,
      })
    }
  }
  ctx.restore()
  return { screens, metrics: { scale, fontPx, font } }
}
