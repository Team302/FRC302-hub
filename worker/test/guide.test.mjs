// The in-app guide names buttons and pages. Each <Btn>Label</Btn> must still appear as text
// somewhere else in the frontend, so renaming a button without updating the guide fails here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../../frontend/src/', import.meta.url).pathname
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(jsx?|tsx?)$/.test(f) ? [p] : [] })

test('every button the guides name still exists in the app', () => {
  const guides = ['pages/Guide.jsx', 'pages/Welcome.jsx'].map((f) => join(SRC, f)).filter((f) => { try { return statSync(f).isFile() } catch { return false } })
  const others = files(SRC).filter((f) => !guides.includes(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
  const labels = new Set(guides.flatMap((g) => [...readFileSync(g, 'utf8').matchAll(/<Btn>([^<{]+)<\/Btn>/g)].map((m) => m[1].trim())))
  assert.ok(labels.size > 20, `found only ${labels.size} labels; did the markup change?`)
  const missing = [...labels].filter((l) => !['>', '\'', '"', '`'].some((q) => others.includes(q + l)))
  assert.deepEqual(missing, [], `The guide names these, but the app doesn't show them any more: ${missing.join(', ')}`)
})
