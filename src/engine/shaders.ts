/**
 * GLSL ES 3.0 shaders.
 *  - Deep Glow: threshold prefilter → dual-Kawase downsample chain → weighted upsample (HDR, float targets)
 *  - Rain: procedural sliding drops + trails + static droplets, refracting a mip-mapped background with fog
 *  - Composite: background (refracted/fogged) + text (premultiplied) + bloom with optional chromatic split
 */

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/** Bright-pass on the glow mask (canvas textures are top-down, so flip Y). */
export const PREFILTER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uThreshold;
uniform vec2 uTexel;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  // 4-tap box to stabilise thin strokes before thresholding
  vec4 c = texture(uSrc, uv + uTexel * vec2(-0.5, -0.5));
  c += texture(uSrc, uv + uTexel * vec2(0.5, -0.5));
  c += texture(uSrc, uv + uTexel * vec2(-0.5, 0.5));
  c += texture(uSrc, uv + uTexel * vec2(0.5, 0.5));
  c *= 0.25;
  float lum = max(c.r, max(c.g, c.b));
  float knee = 0.1;
  float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
  outColor = vec4(c.rgb * contrib, 1.0);
}`

export const DOWN = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uSpread;
void main() {
  vec2 o = uTexel * uSpread;
  vec4 sum = texture(uSrc, vUv) * 4.0;
  sum += texture(uSrc, vUv + vec2(-o.x, -o.y));
  sum += texture(uSrc, vUv + vec2( o.x, -o.y));
  sum += texture(uSrc, vUv + vec2(-o.x,  o.y));
  sum += texture(uSrc, vUv + vec2( o.x,  o.y));
  outColor = sum / 8.0;
}`

export const UP = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;   // lower (blurrier) level
uniform sampler2D uBase;  // current level from the down chain
uniform vec2 uTexel;
uniform float uSpread;
uniform float uFalloff;
void main() {
  vec2 o = uTexel * uSpread;
  vec4 sum = texture(uSrc, vUv + vec2(-o.x * 2.0, 0.0));
  sum += texture(uSrc, vUv + vec2(-o.x, o.y)) * 2.0;
  sum += texture(uSrc, vUv + vec2(0.0, o.y * 2.0));
  sum += texture(uSrc, vUv + vec2(o.x, o.y)) * 2.0;
  sum += texture(uSrc, vUv + vec2(o.x * 2.0, 0.0));
  sum += texture(uSrc, vUv + vec2(o.x, -o.y)) * 2.0;
  sum += texture(uSrc, vUv + vec2(0.0, -o.y * 2.0));
  sum += texture(uSrc, vUv + vec2(-o.x, -o.y)) * 2.0;
  outColor = texture(uBase, vUv) + (sum / 12.0) * uFalloff;
}`

export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uBg;
uniform sampler2D uText;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;

uniform float uGlowOn;
uniform float uGlowIntensity;
uniform float uChromatic;
uniform float uGlowOnly;

uniform float uRainOn;
uniform float uDensity;
uniform float uDropSize;
uniform float uSpeed;
uniform float uFog;
uniform float uRefraction;
uniform float uRefractText;
uniform vec3 uRainTint;
uniform float uMaxLod;

// Hash functions — David Hoskins, "Hash without Sine" (MIT).
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

// One layer of sliding drops. Returns (offset.xy, dropMask, trailMask).
vec4 slidingDrops(vec2 p, float t, float cells, float size) {
  vec2 cellSize = vec2(1.0, 2.6) / cells;
  vec2 g = p / cellSize;
  float col = floor(g.x);
  g.y += hash11(col * 12.73) * 13.0;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  vec3 n = hash31(id.x * 71.37 + id.y * 113.91);
  float present = step(0.28, n.z);

  // stick-slip fall from the top of the cell to the bottom, then repeat
  float ph = fract(t * (0.25 + 0.55 * n.y) + n.x);
  float slip = ph - 0.07 * sin(ph * 6.2831 * 3.0) * (1.0 - ph);
  float y = 0.42 - slip * 0.84;
  float x = (n.x - 0.5) * 0.55 + 0.06 * sin(p.y * 14.0 + n.y * 6.2831);

  vec2 d = (st - vec2(x, y)) * cellSize;
  float r = size * cellSize.x * (0.10 + 0.07 * n.y);
  d.y *= mix(1.0, 0.8, step(0.0, d.y)); // slightly teardrop
  float len = length(d);
  float drop = smoothstep(r, r * 0.55, len) * present;
  vec2 offset = (d / max(r, 1e-4)) * drop;

  // trail of tiny beads above the drop
  float above = st.y - y;
  float trailW = r * 0.32 * smoothstep(0.9, 0.0, above);
  float tx = abs(d.x);
  float trail = smoothstep(trailW, trailW * 0.3, tx) * step(0.0, above) * smoothstep(0.85, 0.0, above) * present;
  float bead = fract(st.y * 9.0 + n.z * 3.0) - 0.5;
  vec2 bd = vec2(d.x, bead * cellSize.y / 9.0);
  float beadMask = smoothstep(r * 0.35, r * 0.15, length(bd)) * trail;
  offset += (bd / max(r * 0.35, 1e-4)) * beadMask * 0.5;

  return vec4(offset, max(drop, beadMask), trail);
}

// Static condensation droplets that fade in and out.
vec3 staticDrops(vec2 p, float t, float size) {
  vec2 g = p * 42.0;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  vec3 n = hash32(id);
  vec2 c = (n.xy - 0.5) * 0.7;
  vec2 d = st - c;
  float life = fract(t * 0.12 + n.z);
  float fade = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.6, life);
  float r = (0.12 + 0.18 * n.z) * size;
  float m = smoothstep(r, r * 0.4, length(d)) * fade * step(0.55, fract(n.z * 7.0));
  return vec3(d / max(r, 1e-4) * m, m);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y); // canvas textures are top-down
  vec2 offset = vec2(0.0);
  float wet = 0.0;
  float trail = 0.0;

  if (uRainOn > 0.5) {
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = uTime * (0.4 + uSpeed * 1.6);
    float cells = mix(4.0, 16.0, uDensity);
    float size = mix(0.6, 1.8, uDropSize);
    vec4 a = slidingDrops(p, t, cells, size);
    vec4 b = slidingDrops(p * 1.7 + 3.1, t * 0.9, cells, size * 0.8);
    vec3 s = staticDrops(p * mix(0.7, 1.4, uDensity), uTime, size);
    offset = a.xy + b.xy * 0.7 + s.xy * 0.5;
    wet = clamp(a.z + b.z + s.z, 0.0, 1.0);
    trail = clamp(a.w + b.w * 0.8, 0.0, 1.0);
    offset *= -0.035 * uRefraction; // drops act as tiny inverted lenses
  }

  float clear = clamp(wet * 1.4 + trail * 0.9, 0.0, 1.0);
  float lod = uRainOn > 0.5 ? uFog * uMaxLod * (1.0 - clear) : 0.0;
  vec3 bg = textureLod(uBg, uv + offset, lod).rgb;
  if (uRainOn > 0.5) {
    float l = dot(bg, vec3(0.299, 0.587, 0.114));
    bg = mix(bg, uRainTint * (0.25 + l), uFog * 0.12 * (1.0 - clear));
    bg += wet * 0.035; // faint specular on drops
  }

  vec2 tuv = uv + offset * uRefractText * 0.7;
  vec4 text = texture(uText, tuv);
  vec3 col = bg * (1.0 - text.a) + text.rgb;

  if (uGlowOn > 0.5) {
    vec2 bv = vec2(vUv.x, vUv.y);
    vec3 bloom;
    if (uChromatic > 0.0) {
      vec2 dir = (bv - 0.5) * uChromatic * 0.012;
      bloom = vec3(texture(uBloom, bv + dir).r, texture(uBloom, bv).g, texture(uBloom, bv - dir).b);
    } else {
      bloom = texture(uBloom, bv).rgb;
    }
    bloom *= uGlowIntensity;
    // Deep-glow style: hot cores drift towards white
    float hot = max(max(bloom.r, bloom.g), bloom.b);
    bloom += vec3(max(hot - 1.0, 0.0) * 0.25);
    col = uGlowOnly > 0.5 ? bloom : col + bloom;
  }

  // soft shoulder so bright glows roll off instead of clipping hard
  col = mix(col, 1.0 - exp(-col), smoothstep(0.85, 1.6, max(col.r, max(col.g, col.b))));
  outColor = vec4(col, 1.0);
}`
