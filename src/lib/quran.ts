/** Optional online mode: Uthmani text + translations (alquran.cloud) and per-ayah audio (everyayah.com). */

export const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]

export const SURAH_NAMES = [
  'Al-Fatihah', 'Al-Baqarah', "Ali 'Imran", 'An-Nisa', "Al-Ma'idah", "Al-An'am", "Al-A'raf", 'Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud', 'Yusuf', "Ar-Ra'd", 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Taha', 'Al-Anbya', 'Al-Hajj', "Al-Mu'minun", 'An-Nur', 'Al-Furqan', "Ash-Shu'ara", 'An-Naml', 'Al-Qasas', "Al-'Ankabut", 'Ar-Rum', 'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir', 'Fussilat', 'Ash-Shuraa', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', "Al-Waqi'ah", 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah', 'As-Saf', "Al-Jumu'ah", 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', "Al-Ma'arij", 'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', "An-Naba", "An-Nazi'at", "'Abasa", 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', "Al-A'la", 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duhaa', 'Ash-Sharh', 'At-Tin', "Al-'Alaq", 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', "Al-'Adiyat", "Al-Qari'ah", 'At-Takathur', "Al-'Asr", 'Al-Humazah', 'Al-Fil', 'Quraysh', "Al-Ma'un", 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
]

export const RECITERS = [
  { id: 'Alafasy_128kbps', name: 'Mishary Rashid Alafasy' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit (Murattal)' },
  { id: 'Husary_128kbps', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Al-Minshawi (Murattal)' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'Abdurrahman As-Sudais' },
  { id: 'MaherAlMuaiqly128kbps', name: 'Maher Al-Muaiqly' },
  { id: 'Saood_ash-Shuraym_128kbps', name: "Sa'ud Ash-Shuraym" },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yasser Ad-Dossari' },
  { id: 'Ghamadi_40kbps', name: 'Saad Al-Ghamdi' },
  { id: 'Hani_Rifai_192kbps', name: 'Hani Ar-Rifai' },
]

export const TRANSLATIONS = [
  { id: '', name: 'No translation' },
  { id: 'en.sahih', name: 'English — Saheeh International' },
  { id: 'ur.jalandhry', name: 'اردو — جالندھری' },
  { id: 'ur.junagarhi', name: 'اردو — جوناگڑھی' },
  { id: 'id.indonesian', name: 'Bahasa Indonesia' },
  { id: 'tr.diyanet', name: 'Türkçe — Diyanet' },
  { id: 'fr.hamidullah', name: 'Français — Hamidullah' },
]

export interface FetchedAyah {
  surah: number
  ayah: number
  text: string
  translation?: string
}

export async function fetchAyahText(surah: number, from: number, to: number, translation: string): Promise<{ ayahs: FetchedAyah[]; surahName: string }> {
  const editions = ['quran-uthmani', translation].filter(Boolean).join(',')
  const url = `https://api.alquran.cloud/v1/surah/${surah}/editions/${editions}?offset=${from - 1}&limit=${to - from + 1}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Quran API error ${res.status}`)
  const json = await res.json()
  const [arabic, trans] = json.data as Array<{ englishName: string; ayahs: Array<{ text: string; numberInSurah: number }> }>
  return {
    surahName: arabic.englishName,
    ayahs: arabic.ayahs.map((a, i) => ({ surah, ayah: a.numberInSurah, text: a.text, translation: trans?.ayahs[i]?.text })),
  }
}

export function ayahAudioUrl(reciter: string, surah: number, ayah: number) {
  return `https://everyayah.com/data/${reciter}/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`
}

/** Compare recognised words against the official Uthmani text (online verification). */
export async function fetchSurahPlain(surah: number): Promise<string[]> {
  const res = await fetch(`https://api.alquran.cloud/v1/surah/${surah}/quran-uthmani`)
  if (!res.ok) throw new Error(`Quran API error ${res.status}`)
  const json = await res.json()
  return (json.data.ayahs as Array<{ text: string }>).map((a) => a.text)
}
