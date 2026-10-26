// Test harness: the real worker (worker/src/index.js) against a real SQLite database with the
// real migrations, through a small D1-compatible shim over node:sqlite. No mocks of the code
// under test; only the D1 binding is stood in for.
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { handle } from '../src/index.js'
import { signDevToken } from '../src/lib/auth.js'

const MIGRATIONS = new URL('../../migrations/', import.meta.url)

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params }
  bind(...params) { return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p))) }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) } }
  async run() { const r = this.db.prepare(this.sql).run(...this.params); return { meta: { changes: Number(r.changes) } } }
}

class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:')
    this.db.exec('PRAGMA foreign_keys = ON')
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) this.db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'))
  }
  prepare(sql) { return new Statement(this.db, sql) }
  async batch(stmts) {
    this.db.exec('BEGIN')
    try {
      const out = []
      for (const s of stmts) out.push(await s.run())
      this.db.exec('COMMIT')
      return out
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
}


// In-memory stand-in for an R2 bucket binding (the calls the worker makes).
export class FakeR2 {
  constructor() { this.objects = new Map() }
  async put(key, body, { httpMetadata } = {}) { this.objects.set(key, { bytes: new Uint8Array(body), httpMetadata }) }
  async get(key) {
    const o = this.objects.get(key)
    return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: o.httpMetadata } : null
  }
  async delete(keys) { for (const k of [].concat(keys)) this.objects.delete(k) }
}

export async function makeApp(envOverrides = {}) {
  const env = {
    DB: new D1(),
    ENVIRONMENT: 'development',
    DEV_LOGIN: 'on',
    JWT_SECRET: 'x'.repeat(40),
    FILES: new FakeR2(),
    ...envOverrides,
  }
  const users = {}
  async function addUser(key, role, extra = {}) {
    const id = `usr_${key}`
    env.DB.db.prepare('INSERT INTO users (id, email, name, role, subteam_id, is_active) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, `${key}@example.org`, extra.name || key, role, extra.subteam_id ?? null, extra.is_active ?? 1)
    users[key] = { id, token: await signDevToken(env, id) }
    return users[key]
  }
  async function call(who, method, path, body, headers = {}) {
    const h = { ...headers }
    if (who) h.Authorization = `Bearer ${typeof who === 'string' ? users[who].token : who.token}`
    if (body !== undefined) h['Content-Type'] = 'application/json'
    const res = await handle(new Request(`http://localhost${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, {})
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data, headers: res.headers }
  }
  // A raw-body request (file uploads).
  async function upload(who, path, bytes, { type, filename }) {
    const headers = { Authorization: `Bearer ${users[who].token}`, 'Content-Type': type, 'X-Filename': encodeURIComponent(filename) }
    const res = await handle(new Request(`http://localhost${path}`, { method: 'POST', headers, body: bytes }), env, {})
    return { status: res.status, data: await res.json() }
  }
  async function download(who, path) {
    const res = await handle(new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${users[who].token}` } }), env, {})
    return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) }
  }
  return { env, users, addUser, call, upload, download, sql: (q, ...p) => env.DB.db.prepare(q).all(...p) }
}

// A standard team: one mentor, one lead, two members.
export async function makeTeam(envOverrides) {
  const app = await makeApp(envOverrides)
  await app.addUser('mentor', 'admin', { name: 'Mentor Mo' })
  await app.addUser('lead', 'lead', { name: 'Lead Lee', subteam_id: 'st_prog' })
  await app.addUser('alex', 'member', { name: 'Alex', subteam_id: 'st_mech' })
  await app.addUser('sam', 'member', { name: 'Sam', subteam_id: 'st_elec' })
  return app
}
