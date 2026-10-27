// Turns the manual's content (content.mjs) and screenshots into one HTML document laid out for
// print with Paged.js (running headers, page numbers, a table of contents with page numbers).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const AUDIENCE = {
  everyone: ['Everyone', 'aud-all'],
  leads: ['Leads and mentors', 'aud-lead'],
  mentors: ['Mentors only', 'aud-mentor'],
}

function block(b, ctx) {
  const [type, ...a] = b
  switch (type) {
    case 'p': return `<p>${a[0]}</p>`
    case 'h3': return `<h3>${a[0]}</h3>`
    case 'steps': return `<ol class="steps">${a[0].map((s) => `<li>${s}</li>`).join('')}</ol>`
    case 'list': return `<ul class="bullets">${a[0].map((s) => `<li>${s}</li>`).join('')}</ul>`
    case 'note': case 'tip': case 'warn': {
      const label = { note: 'Note', tip: 'Tip', warn: 'Important' }[type]
      return `<aside class="box box-${type}"><b>${label}.</b> ${a[0]}</aside>`
    }
    case 'table': {
      const [head, rows, cls = ''] = a
      return `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }
    case 'fig': {
      const [spec, caption, opts = {}] = a
      const legend = (spec.callouts || []).map((c) => c[1])
      const shot = ctx.shots[spec.id]
      if (!shot) throw new Error(`Figure ${spec.id} has no screenshot.`)
      ctx.fig += 1
      const num = `${ctx.chapter}.${ctx.fig}`
      const img = `<img src="${shot.rel}" alt="${esc(caption)}" style="${shot.phone ? '' : `width:${Math.min(100, (shot.width / (opts.scaleTo || 1280)) * 100).toFixed(1)}%`}">`
      const pic = shot.phone ? `<div class="phone">${img}</div>` : `<div class="shot">${img}</div>`
      const leg = legend.length ? `<ol class="legend">${legend.map((l, i) => `<li><span class="num">${i + 1}</span><span>${l}</span></li>`).join('')}</ol>` : ''
      const side = shot.phone && legend.length
      return `<figure class="${side ? 'side' : ''} ${opts.small ? 'small' : ''}">${side ? `<div class="pic">${pic}</div><div class="leg">${leg}</div>` : pic + leg}<figcaption><b>Figure ${num}.</b> ${caption}</figcaption></figure>`
    }
    default: throw new Error(`Unknown block ${type}`)
  }
}

export function renderManual({ chapters, shots, meta, fontUrl, logoUrl }) {
  // Chapters are numbered 1, 2, 3…; appendices (c.appendix = 'A') by letter.
  let n = 0
  const nums = chapters.map((c) => c.appendix || String(++n))
  const tocLine = (href, label, cls) => `<li class="${cls}"><a href="${href}"><span class="t">${label}</span><span class="dots"></span></a></li>`
  const toc = chapters.map((c, ci) => `
    ${tocLine(`#ch-${slug(c.title)}`, `${c.appendix ? `Appendix ${c.appendix}:` : `${nums[ci]}.`} ${esc(c.title)}`, 'toc-ch')}
    ${c.sections.map((s, si) => tocLine(`#s-${slug(c.title)}-${slug(s.title)}`, `${nums[ci]}.${si + 1} ${esc(s.title)}`, 'toc-sec')).join('')}`).join('')

  const body = chapters.map((c, ci) => {
    const ctx = { chapter: nums[ci], fig: 0, shots }
    return `<section class="chapter" id="ch-${slug(c.title)}">
      <div class="chapter-head"><span class="ch-num">${c.appendix ? `Appendix ${c.appendix}` : `Chapter ${nums[ci]}`}</span><h1>${esc(c.title)}</h1>${c.intro ? `<p class="lead">${c.intro}</p>` : ''}</div>
      ${c.sections.map((s, si) => {
        const [aud, cls] = AUDIENCE[s.audience || 'everyone']
        return `<section class="sec" id="s-${slug(c.title)}-${slug(s.title)}">
          <h2><span class="sec-num">${nums[ci]}.${si + 1}</span> ${esc(s.title)} <span class="aud ${cls}">${aud}</span></h2>
          ${s.blocks.map((b) => block(b, ctx)).join('\n')}
        </section>`
      }).join('\n')}
    </section>`
  }).join('\n')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>302 Hub User Manual</title>
<style>
@font-face { font-family: 'Inter'; src: url('${fontUrl}') format('woff2'); font-weight: 100 900; }
:root { --green: #146c43; --green-soft: #e8f3ed; --flame: #ea580c; --ink: #1c1d1f; --muted: #5d6066; --line: #e3e4e6; --paper: #fff; }
@page { size: Letter; margin: 0.85in 0.8in 0.9in;
  @top-left { content: string(chapter); font: 500 8.5pt Inter; color: #8a8d93; }
  @top-right { content: "302 Hub User Manual"; font: 500 8.5pt Inter; color: #8a8d93; }
  @bottom-right { content: counter(page); font: 600 9pt Inter; color: #5d6066; }
  @bottom-left { content: "${esc(meta.footer)}"; font: 400 7.5pt Inter; color: #a0a3a8; }
}
@page cover { margin: 0; @top-left { content: none } @top-right { content: none } @bottom-right { content: none } @bottom-left { content: none } }
@page front { @top-left { content: none } }
html { font-family: Inter, system-ui, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.5; }
body { margin: 0; }
b { font-weight: 600; }
.cover { page: cover; height: 11in; box-sizing: border-box; padding: 1.1in 0.9in; display: flex; flex-direction: column; background: linear-gradient(160deg, #0f3d27 0%, #146c43 55%, #1f8a57 100%); color: #fff; break-after: page; }
.cover .logo { background: #fff; border-radius: 18px; padding: 14px 18px; align-self: flex-start; }
.cover .logo img { height: 72px; display: block; }
.cover h1 { font-size: 40pt; line-height: 1.05; margin: 1.6in 0 0.15in; letter-spacing: -0.02em; font-weight: 700; }
.cover .sub { font-size: 14pt; opacity: .9; max-width: 5in; }
.cover .meta { margin-top: auto; font-size: 9pt; opacity: .8; border-top: 1px solid rgba(255,255,255,.3); padding-top: 12px; }
.front { page: front; break-after: page; }
.front h1 { font-size: 20pt; margin: 0 0 .15in; letter-spacing: -0.01em; }
.toc { list-style: none; padding: 0; margin: 0; }
.toc a { color: inherit; text-decoration: none; display: flex; align-items: baseline; }
.toc a .dots { flex: 1; border-bottom: 1.2px dotted #b9bcc1; margin: 0 5pt; transform: translateY(-3pt); }
.toc a::after { content: target-counter(attr(href), page); color: var(--muted); font-variant-numeric: tabular-nums; }
.toc-ch { font-weight: 600; margin-top: 9pt; font-size: 10.5pt; }
.toc-sec { padding-left: 18pt; font-size: 9.5pt; color: #3a3c40; margin-top: 2pt; }
.chapter { break-before: page; }
.chapter-head { border-bottom: 3px solid var(--green); padding-bottom: 10pt; margin-bottom: 14pt; }
.ch-num { color: var(--green); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 8.5pt; }
.chapter-head h1 { string-set: chapter content(text); font-size: 24pt; margin: 2pt 0 4pt; letter-spacing: -0.015em; }
.lead { font-size: 11pt; color: #3a3c40; margin: 0; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; break-after: avoid; letter-spacing: -0.01em; }
.sec-num { color: var(--green); margin-right: 4pt; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
.aud { white-space: nowrap; font-size: 7.5pt; font-weight: 600; padding: 2pt 6pt; border-radius: 99px; vertical-align: 3pt; margin-left: 6pt; letter-spacing: .02em; }
.aud-all { background: #eef0f2; color: #4a4d52; }
.aud-lead { background: #e6efff; color: #1d4ed8; }
.aud-mentor { background: #fdecef; color: #b4233c; }
.ui { font-weight: 600; background: #f1f2f4; border: 1px solid #dfe1e4; border-radius: 4px; padding: 0 4pt; font-size: 9pt; white-space: nowrap; }
kbd { font: 600 8.5pt Inter; border: 1px solid #cfd2d6; border-bottom-width: 2px; border-radius: 4px; padding: 0 4pt; background: #fafafa; }
.steps { padding-left: 0; list-style: none; counter-reset: step; margin: 4pt 0 9pt; }
.steps li { counter-increment: step; position: relative; padding-left: 24pt; margin-bottom: 4pt; }
.steps li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 16pt; height: 16pt; border-radius: 50%; background: var(--green); color: #fff; font-weight: 700; font-size: 8pt; text-align: center; line-height: 16pt; }
.bullets { margin: 3pt 0 9pt; padding-left: 15pt; }
.bullets li { margin-bottom: 3pt; }
.box { border-left: 3px solid; border-radius: 0 6px 6px 0; padding: 7pt 10pt; margin: 8pt 0 10pt; font-size: 9.5pt; break-inside: avoid; }
.box-note { border-color: #5b7083; background: #f3f5f7; }
.box-tip { border-color: var(--green); background: var(--green-soft); }
.box-warn { border-color: var(--flame); background: #fff3eb; }
figure { margin: 10pt 0 14pt; break-inside: avoid; }
.shot { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); line-height: 0; background: #fafafa; text-align: center; }
.shot img { max-width: 100%; max-height: 5.2in; object-fit: contain; }
figure.small .shot { display: inline-block; max-width: 62%; }
figure.small figcaption, figure.small .legend { max-width: 62%; }
.phone { width: 2.15in; margin: 0 auto; border: 7px solid #1c1d1f; border-radius: 26px; overflow: hidden; line-height: 0; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
.phone img { width: 100%; }
figure.side { display: grid; grid-template-columns: 2.6in 1fr; gap: 16pt; align-items: start; }
figure.side figcaption { grid-column: 1 / -1; }
figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 5pt; }
.legend { list-style: none; padding: 0; margin: 7pt 0 0; font-size: 9pt; columns: 2; column-gap: 18pt; }
figure.side .legend { columns: 1; margin-top: 0; }
.legend li { display: flex; gap: 7pt; margin-bottom: 4pt; break-inside: avoid; }
.legend .num { flex: none; width: 15pt; height: 15pt; border-radius: 50%; background: var(--flame); color: #fff; font-weight: 700; font-size: 8pt; text-align: center; line-height: 15pt; margin-top: 1pt; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 9pt; break-inside: auto; }
th { text-align: left; background: #f3f5f7; font-weight: 600; }
th, td { border-bottom: 1px solid var(--line); padding: 4pt 6pt; vertical-align: top; }
table.matrix td:not(:first-child), table.matrix th:not(:first-child) { text-align: center; width: 13%; }
tr { break-inside: avoid; }
</style></head><body>
<section class="cover">
  <div class="logo"><img src="${logoUrl}" alt="Team 302"></div>
  <h1>302 Hub<br>User Manual</h1>
  <div class="sub">How to use the team’s hub for tasks, meetings, hours, trips, equipment and expenses. For students, leads and mentors of FRC Team 302, Lake Orion Robotics.</div>
  <div class="meta">${esc(meta.cover)}</div>
</section>
<section class="front">
  <h1>Contents</h1>
  <ul class="toc">${toc}</ul>
</section>
${body}
</body></html>`
}
