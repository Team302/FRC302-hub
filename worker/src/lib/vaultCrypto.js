// ─── Vault secrets at rest: AES-256-GCM ──────────────────────────────────────
// Adapted from ProjectPro's lib/crypto.js, with key ids added so the key can be rotated
// without taking the vault offline.
//
// KEYS (wrangler secrets): VAULT_KEY, and while rotating, VAULT_KEY_PREVIOUS. Each is standard
// Base64 of exactly 32 random bytes:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// New ciphertext is always written with VAULT_KEY. Ciphertext names the key it was written with
// (kid = first 8 hex chars of SHA-256 of the key bytes), so a blob written under
// VAULT_KEY_PREVIOUS still opens, and is re-sealed under VAULT_KEY the next time it is revealed
// (routes/vault.js). POST /api/vault/rekey (admin) re-seals every straggler at once, after which
// VAULT_KEY_PREVIOUS can be deleted.
//
// BLOB: 'v2.<kid>.<b64url iv>.<b64url ciphertext||tag>'. AAD: 'vault|<entry id>|<field>', so a
// blob moved to another row or column fails authentication instead of decrypting.
//
// Threat model, stated plainly: this protects a leaked database export or backup. It does NOT
// protect against someone who controls the Worker (Cloudflare account access, a malicious
// deploy) — the Worker holds the key and decrypts on request. That is the trade for a vault
// that needs no master password; see README "Vault security model".

const KEY_BYTES = 32
const IV_BYTES = 12
const VERSION = 'v2'
const encoder = new TextEncoder()

export class VaultCryptoError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'VaultCryptoError'
    this.code = code
  }
}

function decodeKey(secret, name) {
  if (typeof secret !== 'string' || secret.trim() === '') return null
  const match = /^([A-Za-z0-9+/_-]{43})=?$/.exec(secret.trim())
  let binary = ''
  try {
    if (match) binary = atob(`${match[1].replace(/-/g, '+').replace(/_/g, '/')}=`)
  } catch { /* falls through to the error below */ }
  if (binary.length !== KEY_BYTES) {
    throw new VaultCryptoError('bad_key', `${name} must be Base64 of exactly 32 random bytes.`)
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

const cache = new Map()

async function loadKey(secret, name) {
  const cacheKey = `${name}:${secret}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)
  const bytes = decodeKey(secret, name)
  if (!bytes) return null
  const pending = (async () => {
    const kid = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).slice(0, 8)
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    return { kid, key }
  })()
  cache.set(cacheKey, pending)
  return pending
}

// { current, previous } — current is required for any vault operation.
export async function vaultKeys(env) {
  const current = await loadKey(env?.VAULT_KEY, 'VAULT_KEY')
  if (!current) throw new VaultCryptoError('not_configured', 'The vault is not set up: VAULT_KEY is missing.')
  const previous = await loadKey(env?.VAULT_KEY_PREVIOUS, 'VAULT_KEY_PREVIOUS')
  return { current, previous: previous && previous.kid !== current.kid ? previous : null }
}

export function vaultConfigured(env) {
  try {
    return !!decodeKey(env?.VAULT_KEY, 'VAULT_KEY')
  } catch {
    return false
  }
}

export const vaultAad = (entryId, field) => `vault|${entryId}|${field}`

export async function sealSecret(env, plaintext, aad) {
  if (typeof plaintext !== 'string' || plaintext === '') throw new VaultCryptoError('empty', 'Nothing to encrypt.')
  const { current } = await vaultKeys(env)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, current.key, encoder.encode(plaintext))
  return `${VERSION}.${current.kid}.${b64url(iv)}.${b64url(new Uint8Array(sealed))}`
}

// → { plaintext, stale } where stale means it was written with a key other than VAULT_KEY and
// should be re-sealed.
export async function openSecret(env, blob, aad) {
  const parts = typeof blob === 'string' ? blob.split('.') : []
  const iv = parts.length === 4 && parts[0] === VERSION ? fromB64url(parts[2]) : null
  const sealed = iv ? fromB64url(parts[3]) : null
  if (!iv || iv.length !== IV_BYTES || !sealed || sealed.length <= 16) {
    throw new VaultCryptoError('decrypt_failed', 'The stored secret is malformed.')
  }
  const { current, previous } = await vaultKeys(env)
  const key = [current, previous].find((k) => k && k.kid === parts[1])
  if (!key) throw new VaultCryptoError('unknown_key', 'The stored secret was encrypted with a key this server no longer has.')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key.key, sealed)
    return { plaintext: new TextDecoder('utf-8', { fatal: true }).decode(plain), stale: key !== current }
  } catch {
    throw new VaultCryptoError('decrypt_failed', 'The stored secret failed authentication (wrong key, wrong entry, or altered).')
  }
}
