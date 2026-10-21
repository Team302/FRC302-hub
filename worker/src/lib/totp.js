// RFC 6238 TOTP (the 6-digit codes from authenticator apps), so a shared account with 2FA
// turned on (FIRST dashboard, Onshape, the team Google account) can live in the vault instead of
// on one mentor's phone. SHA-1, 30-second step, 6 digits: what every consumer site uses.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// Accepts a bare Base32 seed or an otpauth:// URI (what a QR code holds). Returns the
// normalised Base32 seed, or null if it is not one.
export function normaliseSeed(input) {
  if (typeof input !== 'string') return null
  let raw = input.trim()
  if (/^otpauth:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).searchParams.get('secret') || ''
    } catch {
      return null
    }
  }
  const seed = raw.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
  if (seed.length < 16 || seed.length > 128 || [...seed].some((c) => !ALPHABET.includes(c))) return null
  return seed
}

function base32Decode(seed) {
  let bits = 0
  let value = 0
  const out = []
  for (const c of seed) {
    value = (value << 5) | ALPHABET.indexOf(c)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export async function totpCode(seed, nowMs = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(nowMs / 1000 / step)
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const key = await crypto.subtle.importKey('raw', base32Decode(seed), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = mac[mac.length - 1] & 0x0f
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  const code = String(bin % 10 ** digits).padStart(digits, '0')
  const secondsLeft = step - (Math.floor(nowMs / 1000) % step)
  return { code, secondsLeft }
}
