// Team passwords live in a dedicated password manager (Vaultwarden, or Bitwarden), not in the hub:
// README → Passwords. The hub only knows where it is, so the Passwords page can link to it.
import { json } from '../lib/http.js'

// PASSWORDS_URL (wrangler.toml), https only.
export function passwordsUrl(env) {
  try {
    const url = new URL(env.PASSWORDS_URL || '')
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

export function passwordRoutes(router, authed) {
  router.get('/api/passwords', authed(async (_req, env) => json({ url: passwordsUrl(env) })))
}
