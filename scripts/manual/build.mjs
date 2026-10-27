// Builds docs/302-Hub-User-Manual.pdf: starts a throwaway hub with demo data, takes every
// screenshot the manual uses, lays the manual out with Paged.js and prints it to PDF.
//   npm run docs:manual            (builds the frontend first)
//   npm run docs:manual -- --no-build --keep
// Needs Playwright's Chromium: `npm i -D playwright && npx playwright install chromium` if you
// don't have it. Set PLAYWRIGHT_CHROMIUM_PATH to use a particular Chromium.
import { execSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chapters } from './content.mjs'
import { renderManual } from './render.mjs'
import { seedDemo, startServer } from './server.mjs'
import { contextFromServer, seedExtras } from './seed-extras.mjs'
import { capture } from './shots.mjs'

const args = new Set(process.argv.slice(2))
const OUT = resolve('docs/302-Hub-User-Manual.pdf')
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7).split(',')

async function loadPlaywright() {
  try { return await import('playwright') } catch { /* not a project dependency */ }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim()
    return createRequire(join(globalRoot, 'noop.js'))('playwright')
  } catch {
    throw new Error('Playwright isn’t installed. Run: npm i -D playwright && npx playwright install chromium')
  }
}

if (!args.has('--no-build')) {
  console.log('Building the frontend…')
  const r = spawnSync('npm', ['run', 'build', '--prefix', 'frontend'], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status || 1)
}

const work = mkdtempSync(join(tmpdir(), 'hub-manual-out-'))
const shotsDir = join(work, 'shots')
mkdirSync(shotsDir)
// --reuse: use a hub already running on the manual's port with demo data (faster when iterating).
const reuse = args.has('--reuse')
if (!reuse) console.log('Starting a throwaway hub with demo data…')
const server = reuse ? { stop() {} } : await startServer()
let browser
try {
  if (!reuse) seedDemo()
  const ctx = reuse ? await contextFromServer() : await seedExtras()
  const { chromium } = await loadPlaywright()
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {})

  const specs = chapters.flatMap((c) => c.sections.flatMap((s) => s.blocks.filter((b) => b[0] === 'fig').map((b) => b[1])))
  const ids = new Set()
  for (const s of specs) { if (ids.has(s.id)) throw new Error(`Two figures are called ${s.id}.`); ids.add(s.id) }
  const shots = {}
  const problems = []
  for (const spec of specs) {
    if (only && !only.includes(spec.id)) continue
    process.stdout.write(`  ${spec.id}… `)
    const shot = await capture(browser, spec, shotsDir, ctx)
    shots[spec.id] = { ...shot, rel: `shots/${spec.id}.jpg` }
    console.log(shot.problems.length ? `PROBLEM: ${shot.problems.join('; ')}` : 'ok')
    problems.push(...shot.problems.map((p) => `${spec.id}: ${p}`))
  }
  if (only) { console.log(`Screenshots in ${shotsDir}`); process.exit(problems.length ? 1 : 0) }
  if (problems.length) throw new Error(`Some screenshots didn't come out right:\n  ${problems.join('\n  ')}`)

  // Lay it out
  const font = 'frontend/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
  copyFileSync(font, join(work, 'inter.woff2'))
  copyFileSync('frontend/public/brand/logo.png', join(work, 'logo.png'))
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() } catch { return 'unknown' } })()
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const html = renderManual({ chapters, shots, fontUrl: 'inter.woff2', logoUrl: 'logo.png', meta: { cover: `Edition of ${date} · generated from the app at commit ${commit}. Screens show demo data; names are made up.`, footer: `Edition of ${date}` } })
  copyFileSync('node_modules/pagedjs/dist/paged.polyfill.min.js', join(work, 'paged.js'))
  writeFileSync(join(work, 'manual.html'), html.replace('</head>', () => '<script>window.PagedConfig = { auto: true, after: () => { window.__paged = true } }</script><script src="paged.js"></script></head>'))

  console.log('Laying out pages…')
  const page = await browser.newPage()
  await page.goto(pathToFileURL(join(work, 'manual.html')).href)
  await page.waitForFunction(() => window.__paged === true, null, { timeout: 180000 })
  const pages = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length)
  mkdirSync('docs', { recursive: true })
  await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true })
  console.log(`Wrote ${OUT} (${pages} pages).`)
  if (args.has('--keep')) console.log(`HTML and screenshots kept in ${work}`)
} finally {
  await browser?.close()
  server.stop()
  if (!args.has('--keep') && !only) rmSync(work, { recursive: true, force: true })
}
