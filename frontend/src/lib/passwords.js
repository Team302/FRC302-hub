// Password helpers for the vault, all in the browser.

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!#$%&*+-=?@^_'

// Unbiased random integer in [0, n) (rejection sampling), so no outcome is likelier than another.
function randomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}
const pick = (chars) => chars[randomInt(chars.length)]

// 20 characters from one of each class, shuffled. Lookalikes (l, 1, O, 0, I) are left out
// because people read these off a screen and type them on a robot laptop.
export function generatePassword(length = 20) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < length) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) { // Fisher–Yates
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// Have I Been Pwned "range" check (k-anonymity): only the first 5 hex characters of the
// password's SHA-1 leave the browser; the match is done here. Returns how many breaches the
// password appeared in (0 = not found), or null if the service couldn't be reached.
export async function breachCount(password) {
  if (!password) return 0
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } })
    if (!res.ok) return null
    for (const line of (await res.text()).split('\n')) {
      const [suffix, count] = line.trim().split(':')
      if (suffix === hex.slice(5)) return Number(count) || 0
    }
    return 0
  } catch {
    return null
  }
}
