/**
 * StudioRenderer — deterministic frame renderer used for both live preview and export.
 * render(doc, t) depends only on the document, the time and the background media,
 * so exported frames match the preview exactly.
 *
 * Layers: background canvas → WebGL texture (mipmapped, for rain fog)
 *         text canvas (per-word colours + animation) → texture
 *         glow-mask canvas (per-word glow colours) → bloom chain
 */
import type { Easing, ProjectDoc } from '../lib/types'
import { computeLayout, type ScreenLayout, type LayoutMetrics } from './layout'
import { COMPOSITE, DOWN, PREFILTER, UP, VERT } from './shaders'

type Ctx2D = CanvasRenderingContext2D

interface Target {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

const EASE: Record<Easing, (x: number) => number> = {
  linear: (x) => x,
  easeOut: (x) => 1 - (1 - x) * (1 - x),
  easeInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  expoOut: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = parseInt(full || '000000', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  const k = clamp01(t)
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`
}

export interface RenderMedia {
  bg?: HTMLImageElement | HTMLVideoElement | null
}

export class StudioRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null
  private ctx2d: Ctx2D | null = null
  private bgCanvas = document.createElement('canvas')
  private textCanvas = document.createElement('canvas')
  private glowCanvas = document.createElement('canvas')
  private bgCtx = this.bgCanvas.getContext('2d')!
  private textCtx = this.textCanvas.getContext('2d')!
  private glowCtx = this.glowCanvas.getContext('2d')!
  private progs: Record<string, WebGLProgram> = {}
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  private texBg: WebGLTexture | null = null
  private texText: WebGLTexture | null = null
  private texGlow: WebGLTexture | null = null
  private downs: Target[] = []
  private ups: Target[] = []
  private floatOk = false
  private bgKey = ''
  private layoutKey = ''
  private layout: { screens: ScreenLayout[]; metrics: LayoutMetrics } = { screens: [], metrics: { scale: 1, fontPx: 0, font: '' } }
  width = 0
  height = 0

  private static glSupport: boolean | null = null

  /** Compile every shader once on a throwaway canvas so a broken driver falls back to 2D instead of crashing. */
  static supportsWebGl2() {
    if (StudioRenderer.glSupport !== null) return StudioRenderer.glSupport
    try {
      const probe = document.createElement('canvas')
      const gl = probe.getContext('webgl2')
      if (!gl) throw new Error('WebGL2 not available')
      const r = Object.create(StudioRenderer.prototype) as StudioRenderer
      ;(r as unknown as { progs: Record<string, WebGLProgram> }).progs = {}
      r['initGl'](gl)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      StudioRenderer.glSupport = true
    } catch (e) {
      console.warn('[Ayah Studio] WebGL2 path disabled:', e)
      StudioRenderer.glSupport = false
    }
    return StudioRenderer.glSupport
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = StudioRenderer.supportsWebGl2() ? canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false }) : null
    if (this.gl) this.initGl(this.gl)
    else this.ctx2d = canvas.getContext('2d')
  }

  get webgl() {
    return !!this.gl
  }

  /* --------------------------------------------------------------- */
  private initGl(gl: WebGL2RenderingContext) {
    this.floatOk = !!gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader error')
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const make = (fs: string) => {
      const p = gl.createProgram()!
      gl.attachShader(p, vs)
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
      gl.bindAttribLocation(p, 0, 'aPos')
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link error')
      return p
    }
    this.progs = { prefilter: make(PREFILTER), down: make(DOWN), up: make(UP), composite: make(COMPOSITE) }
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.texBg = gl.createTexture()
    this.texText = gl.createTexture()
    this.texGlow = gl.createTexture()
  }

  private u(p: WebGLProgram, name: string) {
    let m = this.uniforms.get(p)
    if (!m) this.uniforms.set(p, (m = new Map()))
    if (!m.has(name)) m.set(name, this.gl!.getUniformLocation(p, name))
    return m.get(name)!
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl!
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    if (this.floatOk) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { fbo, tex, w, h }
  }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.round(w))
    h = Math.max(2, Math.round(h))
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h
    for (const c of [this.canvas, this.bgCanvas, this.textCanvas, this.glowCanvas]) {
      c.width = w
      c.height = h
    }
    this.bgKey = ''
    this.layoutKey = ''
    if (this.gl) {
      const gl = this.gl
      for (const t of [...this.downs, ...this.ups]) {
        gl.deleteTexture(t.tex)
        gl.deleteFramebuffer(t.fbo)
      }
      this.downs = []
      this.ups = []
      let lw = Math.max(1, w >> 1)
      let lh = Math.max(1, h >> 1)
      for (let i = 0; i < 8; i++) {
        this.downs.push(this.makeTarget(lw, lh))
        this.ups.push(this.makeTarget(lw, lh))
        lw = Math.max(1, lw >> 1)
        lh = Math.max(1, lh >> 1)
      }
    }
  }

  /** Public so the UI can map clicks on the preview to words. */
  getLayout(doc: ProjectDoc) {
    this.ensureLayout(doc)
    return this.layout
  }

  private ensureLayout(doc: ProjectDoc) {
    const key = JSON.stringify([
      this.width,
      this.height,
      doc.style,
      doc.words.map((w) => w.text + '|' + w.ayahIndex),
      doc.ayahs.map((a) => [a.ayah, a.translation]),
      document.fonts.size,
      document.fonts.status,
    ])
    if (key === this.layoutKey) return
    this.layoutKey = key
    this.layout = computeLayout(doc, this.width, this.height, this.textCtx)
  }

  /** Which screen is visible at time t (and the previous one for cross-fading). */
  screenAt(doc: ProjectDoc, t: number) {
    const screens = this.layout.screens
    if (!screens.length) return { index: -1, appearAt: 0 }
    const appear = (i: number) => {
      const start = doc.words[screens[i].firstWord]?.start ?? 0
      return i === 0 ? Math.max(0, start - 0.8) : start - 0.25
    }
    let idx = 0
    for (let i = 0; i < screens.length; i++) if (appear(i) <= t) idx = i
    return { index: idx, appearAt: appear(idx) }
  }

  /* --------------------------------------------------------------- */
  private drawBackground(doc: ProjectDoc, media: RenderMedia) {
    const { width: W, height: H } = this
    const b = doc.background
    const th = doc.theme
    const isVideo = b.type === 'video' && media.bg instanceof HTMLVideoElement
    const key = JSON.stringify([W, H, b, th.background, th.background2, media.bg ? (media.bg as HTMLImageElement).src : ''])
    if (!isVideo && key === this.bgKey) return false
    this.bgKey = key
    const ctx = this.bgCtx
    ctx.fillStyle = th.background
    ctx.fillRect(0, 0, W, H)
    if (b.type === 'gradient') {
      const a = ((b.angle - 90) * Math.PI) / 180
      const r = Math.hypot(W, H) / 2
      const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
      g.addColorStop(0, th.background)
      g.addColorStop(1, th.background2)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    } else if ((b.type === 'image' || b.type === 'video') && media.bg) {
      const el = media.bg
      const mw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
      const mh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
      if (mw && mh) {
        const k = Math.max(W / mw, H / mh)
        const dw = mw * k
        const dh = mh * k
        ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh)
      }
      if (b.dim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${b.dim})`
        ctx.fillRect(0, 0, W, H)
      }
    }
    return true
  }

  private drawText(doc: ProjectDoc, t: number) {
    const { width: W, height: H } = this
    const tc = this.textCtx
    const gc = this.glowCtx
    tc.clearRect(0, 0, W, H)
    gc.clearRect(0, 0, W, H)
    this.ensureLayout(doc)
    const { screens, metrics } = this.layout
    if (!screens.length) return

    const { index, appearAt } = this.screenAt(doc, t)
    const xfade = EASE.easeInOut(clamp01((t - appearAt) / 0.4))
    if (index > 0 && xfade < 1) this.drawScreen(doc, screens[index - 1], t, metrics, 1 - xfade, appearAt)
    this.drawScreen(doc, screens[index], t, metrics, index === 0 ? 1 : xfade, appearAt)
  }

  private drawScreen(doc: ProjectDoc, screen: ScreenLayout, t: number, m: LayoutMetrics, screenAlpha: number, appearAt: number) {
    const s = doc.style
    const th = doc.theme
    const anim = s.animation
    const ease = EASE[anim.easing]
    const I = anim.intensity
    const dur = Math.max(0.05, anim.duration)
    const tc = this.textCtx
    const gc = this.glowCtx
    const glow = doc.glow

    for (const c of [tc, gc]) {
      c.font = m.font
      c.direction = 'rtl'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
    }

    screen.items.forEach((it, rank) => {
      const refIdx = it.wordIndex >= 0 ? it.wordIndex : it.markerOf!
      const word = doc.words[refIdx]
      if (!word) return
      const isMarker = it.wordIndex < 0

      // reveal progress
      let p: number
      if (s.revealMode === 'progressive') p = clamp01((t - (isMarker ? word.end : word.start) + 0.05) / dur)
      else p = clamp01((t - appearAt - rank * 0.025) / dur)
      const e = ease(p)

      // state colours
      const kIn = isMarker ? 0 : clamp01((t - word.start) / 0.12)
      const kOut = clamp01((t - word.end) / 0.3)
      const custom = word.color
      const pending = custom ? mix(custom, th.background, 0.45) : th.pending
      const active = custom ?? th.highlight
      const spoken = custom ?? th.spoken
      let color: string
      if (isMarker) color = t >= word.end ? (custom ?? th.spoken) : pending
      else if (t < word.start) color = pending
      else if (t < word.end) color = mix(pending, active, kIn)
      else color = mix(active, spoken, kOut)

      let alpha = screenAlpha
      if (s.revealMode === 'all' && !isMarker && t < word.start) alpha *= s.pendingOpacity

      let dy = 0
      let scale = 1
      let blur = 0
      let glowMul = 1
      switch (anim.preset) {
        case 'fade':
          alpha *= e
          break
        case 'rise':
          alpha *= e
          dy = (1 - e) * m.fontPx * 0.5 * I
          break
        case 'blur':
          alpha *= 0.25 + 0.75 * e
          blur = (1 - e) * m.fontPx * 0.22 * I
          break
        case 'pop':
          alpha *= e
          scale = 1 - (1 - e) * 0.18 * I + Math.sin(e * Math.PI) * 0.05 * I
          break
        case 'float':
          alpha *= e
          dy = Math.sin(t * 1.1 + it.cx * 0.004) * m.fontPx * 0.05 * I + (1 - e) * m.fontPx * 0.2
          break
        case 'pulse':
          alpha *= e
          glowMul = 1 + 0.35 * Math.sin(t * 2.6) * I
          break
      }
      if (alpha <= 0.002) return

      // active-word emphasis is very subtle by design (sacred text)
      const activeK = !isMarker && t >= word.start && t < word.end ? kIn : !isMarker && t >= word.end ? 1 - kOut : 0
      scale *= 1 + activeK * 0.02 * I

      let glowAmt = 0
      if (glow.enabled) {
        if (isMarker) glowAmt = t >= word.end ? glow.idleGlow * 0.6 : 0
        else if (t < word.start) glowAmt = 0
        else glowAmt = glow.idleGlow + (glow.activeBoost - glow.idleGlow) * activeK
        glowAmt *= glowMul
      }

      const draw = (c: Ctx2D, fill: string, a: number) => {
        c.save()
        c.globalAlpha = clamp01(a)
        if (blur > 0.3) c.filter = `blur(${blur.toFixed(1)}px)`
        c.translate(it.cx, it.cy + dy)
        if (scale !== 1) c.scale(scale, scale)
        c.fillStyle = fill
        c.fillText(it.text, 0, 0)
        c.restore()
      }
      draw(tc, color, alpha)
      if (glowAmt > 0.001) draw(gc, word.glowColor ?? th.glow, alpha * Math.min(1, glowAmt))
      if (glowAmt > 1) draw(gc, word.glowColor ?? th.glow, alpha * Math.min(1, glowAmt - 1))
    })

    // translation line
    const tr = screen.translation
    if (tr) {
      const first = doc.words[screen.firstWord]
      let p = s.revealMode === 'progressive' ? clamp01((t - (first?.start ?? 0)) / (dur * 1.5)) : clamp01((t - appearAt - 0.15) / (dur * 1.5))
      p = EASE.easeOut(p)
      const a = screenAlpha * p
      if (a > 0.002) {
        tc.save()
        tc.globalAlpha = a
        tc.font = tr.font
        tc.direction = tr.dir
        tc.textAlign = tr.align
        tc.textBaseline = 'middle'
        tc.fillStyle = th.translation
        const rise = anim.preset === 'rise' ? (1 - p) * tr.lineH * 0.4 * I : 0
        tr.lines.forEach((line, i) => tc.fillText(line, tr.x, tr.y0 + i * tr.lineH + rise))
        tc.restore()
      }
    }
  }

  /* --------------------------------------------------------------- */
  render(doc: ProjectDoc, t: number, media: RenderMedia = {}, fxTime = t) {
    const bgChanged = this.drawBackground(doc, media)
    this.drawText(doc, t)
    if (this.gl) this.composeGl(doc, fxTime, bgChanged)
    else this.compose2d(doc)
  }

  private upload(tex: WebGLTexture, src: HTMLCanvasElement, mip: boolean) {
    const gl = this.gl!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }

  private pass(prog: WebGLProgram, target: Target | null, bind: () => void) {
    const gl = this.gl!
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, target ? target.w : this.width, target ? target.h : this.height)
    bind()
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private bindTex(prog: WebGLProgram, name: string, unit: number, tex: WebGLTexture) {
    const gl = this.gl!
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(this.u(prog, name), unit)
  }

  private composeGl(doc: ProjectDoc, fxTime: number, bgChanged: boolean) {
    const gl = this.gl!
    const g = doc.glow
    const r = doc.rain
    if (bgChanged) this.upload(this.texBg!, this.bgCanvas, true)
    this.upload(this.texText!, this.textCanvas, false)

    let bloomTex: WebGLTexture | null = null
    if (g.enabled) {
      this.upload(this.texGlow!, this.glowCanvas, false)
      const levels = Math.max(2, Math.min(this.downs.length, 2 + Math.round(g.radius * 6)))
      const spread = 1 + g.radius * 0.6
      const { prefilter, down, up } = this.progs
      this.pass(prefilter, this.downs[0], () => {
        this.bindTex(prefilter, 'uSrc', 0, this.texGlow!)
        gl.uniform1f(this.u(prefilter, 'uThreshold'), g.threshold)
        gl.uniform2f(this.u(prefilter, 'uTexel'), 1 / this.width, 1 / this.height)
      })
      for (let i = 1; i < levels; i++) {
        const src = this.downs[i - 1]
        this.pass(down, this.downs[i], () => {
          this.bindTex(down, 'uSrc', 0, src.tex)
          gl.uniform2f(this.u(down, 'uTexel'), 1 / src.w, 1 / src.h)
          gl.uniform1f(this.u(down, 'uSpread'), spread)
        })
      }
      let lower = this.downs[levels - 1]
      const falloff = 0.35 + g.falloff * 0.9
      for (let i = levels - 2; i >= 0; i--) {
        const target = this.ups[i]
        const src = lower
        this.pass(up, target, () => {
          this.bindTex(up, 'uSrc', 0, src.tex)
          this.bindTex(up, 'uBase', 1, this.downs[i].tex)
          gl.uniform2f(this.u(up, 'uTexel'), 1 / src.w, 1 / src.h)
          gl.uniform1f(this.u(up, 'uSpread'), spread)
          gl.uniform1f(this.u(up, 'uFalloff'), falloff)
        })
        lower = target
      }
      bloomTex = lower.tex
    }

    const c = this.progs.composite
    const tint = hexToRgb(doc.theme.rainTint).map((v) => v / 255)
    this.pass(c, null, () => {
      this.bindTex(c, 'uBg', 0, this.texBg!)
      this.bindTex(c, 'uText', 1, this.texText!)
      this.bindTex(c, 'uBloom', 2, bloomTex ?? this.texText!)
      gl.uniform2f(this.u(c, 'uRes'), this.width, this.height)
      gl.uniform1f(this.u(c, 'uTime'), fxTime)
      gl.uniform1f(this.u(c, 'uGlowOn'), g.enabled ? 1 : 0)
      gl.uniform1f(this.u(c, 'uGlowIntensity'), g.intensity * 1.4)
      gl.uniform1f(this.u(c, 'uChromatic'), g.chromatic)
      gl.uniform1f(this.u(c, 'uGlowOnly'), g.glowOnly ? 1 : 0)
      gl.uniform1f(this.u(c, 'uRainOn'), r.enabled ? 1 : 0)
      gl.uniform1f(this.u(c, 'uDensity'), r.density)
      gl.uniform1f(this.u(c, 'uDropSize'), r.size)
      gl.uniform1f(this.u(c, 'uSpeed'), r.speed)
      gl.uniform1f(this.u(c, 'uFog'), r.fog)
      gl.uniform1f(this.u(c, 'uRefraction'), r.refraction)
      gl.uniform1f(this.u(c, 'uRefractText'), r.refractText ? 1 : 0)
      gl.uniform3f(this.u(c, 'uRainTint'), tint[0], tint[1], tint[2])
      gl.uniform1f(this.u(c, 'uMaxLod'), Math.log2(Math.max(this.width, this.height)) * 0.62)
    })
  }

  /** Fallback when WebGL2 is unavailable: canvas filters approximate the glow, rain is skipped. */
  private compose2d(doc: ProjectDoc) {
    const c = this.ctx2d!
    const { width: W, height: H } = this
    c.globalCompositeOperation = 'source-over'
    c.filter = 'none'
    c.drawImage(this.bgCanvas, 0, 0)
    if (doc.glow.enabled) {
      c.globalCompositeOperation = 'lighter'
      const base = Math.min(W, H) / 1080
      for (const k of [0.6, 1.6, 4]) {
        c.filter = `blur(${(k * 14 * (0.4 + doc.glow.radius) * base).toFixed(1)}px)`
        c.globalAlpha = Math.min(1, doc.glow.intensity * 0.55)
        c.drawImage(this.glowCanvas, 0, 0)
      }
      c.globalAlpha = 1
      c.filter = 'none'
      c.globalCompositeOperation = 'source-over'
    }
    if (!doc.glow.glowOnly) c.drawImage(this.textCanvas, 0, 0)
  }

  /** Read the current frame as RGBA (bottom-up rows for WebGL; FFmpeg flips with vflip). */
  readPixels(out: Uint8Array) {
    if (this.gl) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
      this.gl.readPixels(0, 0, this.width, this.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out)
    } else {
      const img = this.ctx2d!.getImageData(0, 0, this.width, this.height).data
      // flip rows so both paths produce bottom-up data
      const row = this.width * 4
      for (let y = 0; y < this.height; y++) out.set(img.subarray((this.height - 1 - y) * row, (this.height - y) * row), y * row)
    }
  }

  toPngBlob(): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'))
  }

  dispose() {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
