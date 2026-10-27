// Screenshots for the manual. Each figure is a spec: who is signed in, which page, what to click
// first, what to crop to, and which elements get numbered callouts. Callouts are drawn into the
// page itself (an overlay of rings and numbered badges) so they line up exactly with the UI.
import { BASE, login } from './server.mjs'

const tokens = new Map()
async function tokenFor(who) {
  const email = who.includes('@') ? who : who === 'coach' ? 'coach@team302.org' : `${who}@example.org`
  if (!tokens.has(who)) tokens.set(who, await login(email))
  return tokens.get(who)
}

const STILL = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`

// spec: { id, as, path, width?, height?, phone?, theme?, prepare?(page, ctx), target?, pad?, maxHeight?,
//         callouts?: [[selector, legend text, { side, box }]] }
//   target: 'main' (the content area, default), 'viewport', 'dialog', or any selector.
export async function capture(browser, spec, outDir, ctx) {
  const phone = !!spec.phone
  const context = await browser.newContext({
    viewport: { width: spec.width || (phone ? 390 : 1280), height: spec.height || (phone ? 844 : 900) },
    deviceScaleFactor: 2,
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  try {
    if (spec.as) {
      await page.goto(`${BASE}/welcome`)
      await page.evaluate(([t, theme]) => {
        localStorage.setItem('hub302.theme', theme)
        localStorage.setItem('hub302.guideSeen', '1')
        sessionStorage.setItem('hub302.devToken', t)
      }, [await tokenFor(spec.as), spec.theme || 'light'])
    }
    // clock: (ctx) => ms. Freezes the page's clock for figures that show timers.
    if (spec.clock) await page.clock.setFixedTime(new Date(spec.clock(ctx)))
    const path = typeof spec.path === 'function' ? spec.path(ctx) : spec.path
    await page.goto(`${BASE}${path}`)
    await page.addStyleTag({ content: STILL })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
    if (spec.prepare) {
      page.setDefaultTimeout(8000)
      try { await spec.prepare(page, ctx) } catch (e) { problems.push(`prepare failed: ${e.message.split('\n')[0]}`) }
    }
    await page.waitForTimeout(300)

    // Callouts
    const marks = []
    for (const [i, entry] of (spec.callouts || []).entries()) {
      const [selector, , opts = {}] = entry // [selector, legend text, { side, box }]
      const box = await page.locator(selector).first().boundingBox().catch(() => null)
      if (!box) { problems.push(`callout ${i + 1}: nothing matches ${selector}`); continue }
      marks.push({ n: i + 1, box, side: opts.side || 'tl', ring: opts.box !== false })
    }
    await page.evaluate((marks) => {
      const layer = document.createElement('div')
      Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' })
      for (const m of marks) {
        if (m.ring) {
          const r = document.createElement('div')
          Object.assign(r.style, { position: 'fixed', left: `${m.box.x - 4}px`, top: `${m.box.y - 4}px`, width: `${m.box.width + 8}px`, height: `${m.box.height + 8}px`, border: '3px solid #ea580c', borderRadius: '9px', boxShadow: '0 0 0 3px rgba(234,88,12,0.2)' })
          layer.appendChild(r)
        }
        const b = document.createElement('div')
        const at = { tl: [m.box.x - 18, m.box.y - 18], tr: [m.box.x + m.box.width - 12, m.box.y - 18], l: [m.box.x - 38, m.box.y + m.box.height / 2 - 15], r: [m.box.x + m.box.width + 8, m.box.y + m.box.height / 2 - 15], bl: [m.box.x - 18, m.box.y + m.box.height - 12], b: [m.box.x + m.box.width / 2 - 15, m.box.y + m.box.height + 8] }[m.side]
        Object.assign(b.style, { position: 'fixed', left: `${Math.max(2, at[0])}px`, top: `${Math.max(2, at[1])}px`, width: '30px', height: '30px', borderRadius: '50%', background: '#ea580c', color: '#fff', font: '700 16px/30px Inter, system-ui, sans-serif', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.35), 0 0 0 2px #fff' })
        b.textContent = String(m.n)
        layer.appendChild(b)
      }
      document.body.appendChild(layer)
    }, marks)

    // Crop
    const vp = page.viewportSize()
    let clip = { x: 0, y: 0, width: vp.width, height: vp.height }
    const target = spec.target || (phone ? 'viewport' : 'main')
    if (target !== 'viewport') {
      const sel = target === 'dialog' ? '[role="dialog"]' : target === 'main' ? '#main' : target
      const box = await page.locator(sel).last().boundingBox().catch(() => null)
      if (!box) problems.push(`target: nothing matches ${sel}`)
      else {
        const pad = spec.pad ?? (target === 'main' ? 0 : 16)
        const x = Math.max(0, box.x - pad); const y = Math.max(0, box.y - pad)
        clip = { x, y, width: Math.min(vp.width - x, box.width + pad * 2), height: Math.min(vp.height - y, box.height + pad * 2) }
        // The content area is as tall as the window; stop the picture where the page's content ends.
        if (target === 'main') {
          const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#main > * , #main > * > *')].map((el) => el.getBoundingClientRect().bottom)))
          if (Number.isFinite(bottom)) clip.height = Math.min(clip.height, Math.max(200, bottom - clip.y + 28))
        }
      }
    }
    if (spec.maxHeight) clip.height = Math.min(clip.height, spec.maxHeight)
    // JPEG keeps the PDF small; screenshots of the UI have no transparency to lose.
    const file = `${outDir}/${spec.id}.jpg`
    await page.screenshot({ path: file, clip, type: 'jpeg', quality: 86 })
    return { id: spec.id, file, width: clip.width, height: clip.height, phone, problems }
  } finally {
    await context.close()
  }
}
