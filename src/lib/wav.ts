/** Encode an AudioBuffer as a 16-bit PCM WAV file. */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = Math.min(2, buffer.numberOfChannels)
  const sr = buffer.sampleRate
  const len = buffer.length
  const dataSize = len * channels * 2
  const out = new ArrayBuffer(44 + dataSize)
  const v = new DataView(out)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, channels, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * channels * 2, true)
  v.setUint16(32, channels * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  let o = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return new Uint8Array(out)
}

/** Join decoded buffers end to end, returning the joined buffer and each part's time span. */
export function concatBuffers(ctx: BaseAudioContext, parts: AudioBuffer[], gap = 0.15) {
  const sr = ctx.sampleRate
  const gapLen = Math.round(gap * sr)
  const channels = Math.max(...parts.map((p) => p.numberOfChannels))
  const total = parts.reduce((a, p) => a + p.length, 0) + gapLen * (parts.length - 1)
  const out = ctx.createBuffer(channels, total, sr)
  const spans: Array<{ start: number; end: number }> = []
  let offset = 0
  for (const p of parts) {
    for (let c = 0; c < channels; c++) out.getChannelData(c).set(p.getChannelData(Math.min(c, p.numberOfChannels - 1)), offset)
    spans.push({ start: offset / sr, end: (offset + p.length) / sr })
    offset += p.length + gapLen
  }
  return { buffer: out, spans }
}
