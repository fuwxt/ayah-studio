/**
 * Arabic helpers. The original text is NEVER modified — normalisation is used
 * only internally for matching/alignment and length weighting.
 */

// Tashkeel, Quranic annotation marks, tatweel, small high letters, waqf signs.
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF]/g
// Stand-alone waqf / pause marks that some texts separate with spaces.
const WAQF_ONLY = /^[\u06D6-\u06DC\u06DE\u06E9\u0615\u0617]+$/

export function stripDiacritics(s: string) {
  return s.replace(DIACRITICS, '')
}

/** Loose normalisation for comparing recognised text with Mushaf text. */
export function normalizeForMatch(s: string) {
  return stripDiacritics(s)
    .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673]/g, '\u0627') // alef variants → ا
    .replace(/\u0649/g, '\u064A') // alef maqsura → ya
    .replace(/\u0629/g, '\u0647') // ta marbuta → ha
    .replace(/[\u0624]/g, '\u0648')
    .replace(/[\u0626]/g, '\u064A')
    .replace(/\u0621/g, '')
    .replace(/[^\u0621-\u064A]/g, '')
}

/** Rough spoken length of a word (base letters, long vowels and madd weigh more). */
export function spokenWeight(word: string) {
  const base = stripDiacritics(word).replace(/[^\u0621-\u064A]/g, '').length || 1
  const madd = (word.match(/[\u0653\u0670]/g) || []).length // maddah / dagger alef
  const shadda = (word.match(/\u0651/g) || []).length
  return base + madd * 1.6 + shadda * 0.4
}

/**
 * Split a block of Arabic text into ayahs + words.
 * Ayahs are separated by new lines or by ayah-end markers (۝ / ﴿n﴾ / Arabic-Indic numbers).
 * Stand-alone waqf marks are attached to the previous word so they stay visible but are not timed alone.
 */
export function tokenizeQuranText(raw: string): string[][] {
  const cleaned = raw
    .replace(/\r/g, '')
    .replace(/[\u06DD]\s*[\u0660-\u0669\u06F0-\u06F90-9]*/g, '\n')
    .replace(/[\uFD3E\uFD3F]\s*[\u0660-\u0669\u06F0-\u06F90-9]*\s*[\uFD3E\uFD3F]?/g, '\n')
    .replace(/\(\s*[\u0660-\u0669\u06F0-\u06F90-9]+\s*\)/g, '\n')
    .replace(/(^|\s)[\u0660-\u0669\u06F0-\u06F9]+(?=\s|$)/g, '\n')

  return cleaned
    .split(/\n+/)
    .map((line) => {
      const out: string[] = []
      for (const tok of line.split(/\s+/).filter(Boolean)) {
        if (WAQF_ONLY.test(tok) && out.length) out[out.length - 1] += ` ${tok}`
        else out.push(tok)
      }
      return out
    })
    .filter((words) => words.length > 0)
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export function toArabicDigits(n: number) {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)])
}

export function hasArabic(s: string) {
  return /[\u0600-\u06FF]/.test(s)
}
