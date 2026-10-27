// A throwaway hub for the manual's screenshots: its own port and its own empty local database
// (deleted afterwards), filled with the demo team (scripts/seed-demo.mjs) plus the extras the
// manual shows. Never touches your normal dev database.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PORT = 8799
export const BASE = `http://localhost:${PORT}`
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

export async function startServer({ log = () => {} } = {}) {
  const state = mkdtempSync(join(tmpdir(), 'hub-manual-'))
  const migrate = spawnSync(npx, ['wrangler', 'd1', 'migrations', 'apply', 'frc302-hub-db', '--local', '--persist-to', state], { encoding: 'utf8', env: { ...process.env, CI: '1' } })
  if (migrate.status !== 0) throw new Error(`Migrations failed:\n${migrate.stdout}\n${migrate.stderr}`)
  // Dev login is local-only and needs these; .dev.vars supplies JWT_SECRET (run `npm run dev` once first).
  const child = spawn(npx, ['wrangler', 'dev', '--port', String(PORT), '--persist-to', state,
    '--var', 'ENVIRONMENT:development', '--var', 'DEV_LOGIN:on', '--var', 'BOOTSTRAP_ADMIN_EMAIL:coach@team302.org',
    '--var', 'TBA_API_KEY:', '--var', 'PASSWORDS_URL:https://passwords.team302.org'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d) => { output += d; log(String(d)) })
  child.stderr.on('data', (d) => { output += d; log(String(d)) })
  const stop = () => { child.kill('SIGTERM'); try { rmSync(state, { recursive: true, force: true }) } catch { /* in use on Windows */ } }
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) { stop(); throw new Error(`wrangler dev exited:\n${output.slice(-2000)}`) }
    try { if ((await fetch(`${BASE}/api/auth/config`)).ok) return { stop } } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  stop()
  throw new Error(`The hub didn't start on port ${PORT}:\n${output.slice(-2000)}`)
}

export async function login(email) {
  const res = await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
  if (!res.ok) throw new Error(`Dev login for ${email} failed: ${res.status}`)
  return (await res.json()).token
}

export async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data?.error || text}`)
  return data
}

export function seedDemo() {
  const r = spawnSync(process.execPath, ['scripts/seed-demo.mjs', BASE], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`Demo seed failed:\n${r.stdout}\n${r.stderr}`)
}
