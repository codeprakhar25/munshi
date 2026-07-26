/**
 * Base64 for raw audio bytes.
 *
 * Hand-rolled rather than relying on `btoa`/`atob`: React Native does not
 * guarantee them on every platform/engine combination, and a missing global here
 * fails at the worst possible moment — mid-demo, on the device, with the mic open.
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < CHARS.length; i++) t[CHARS.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  const rem = n % 3;
  const main = n - rem;

  for (let i = 0; i < main; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += CHARS[(v >> 18) & 63] + CHARS[(v >> 12) & 63] + CHARS[(v >> 6) & 63] + CHARS[v & 63];
  }
  if (rem === 1) {
    const v = bytes[main];
    out += `${CHARS[v >> 2]}${CHARS[(v << 4) & 63]}==`;
  } else if (rem === 2) {
    const v = (bytes[main] << 8) | bytes[main + 1];
    out += `${CHARS[v >> 10]}${CHARS[(v >> 4) & 63]}${CHARS[(v << 2) & 63]}=`;
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const n = clean.length;
  const out = new Uint8Array((n * 3) >> 2);
  let o = 0;

  for (let i = 0; i + 3 < n; i += 4) {
    const v = (LOOKUP[clean.charCodeAt(i)] << 18)
      | (LOOKUP[clean.charCodeAt(i + 1)] << 12)
      | (LOOKUP[clean.charCodeAt(i + 2)] << 6)
      | LOOKUP[clean.charCodeAt(i + 3)];
    out[o++] = (v >> 16) & 255;
    out[o++] = (v >> 8) & 255;
    out[o++] = v & 255;
  }
  const tail = n & 3;
  if (tail === 2) {
    const v = (LOOKUP[clean.charCodeAt(n - 2)] << 18) | (LOOKUP[clean.charCodeAt(n - 1)] << 12);
    out[o++] = (v >> 16) & 255;
  } else if (tail === 3) {
    const v = (LOOKUP[clean.charCodeAt(n - 3)] << 18)
      | (LOOKUP[clean.charCodeAt(n - 2)] << 12)
      | (LOOKUP[clean.charCodeAt(n - 1)] << 6);
    out[o++] = (v >> 16) & 255;
    out[o++] = (v >> 8) & 255;
  }
  return o === out.length ? out : out.subarray(0, o);
}

/** Float32 [-1,1] -> little-endian PCM16, which is all Saaras accepts. */
export function floatToPcm16(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    const int = v | 0;
    out[i * 2] = int & 255;
    out[i * 2 + 1] = (int >> 8) & 255;
  }
  return out;
}

/** Little-endian PCM16 -> Float32 [-1,1], for scheduling onto the audio graph. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const n = bytes.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = bytes[i * 2];
    const hi = bytes[i * 2 + 1];
    const v = (hi << 8) | lo;
    out[i] = (v & 0x8000 ? v - 0x10000 : v) / 32768;
  }
  return out;
}
