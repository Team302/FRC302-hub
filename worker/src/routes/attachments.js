// Task attachments: part photos, drawings, datasheets, CAD exports. Files live in R2 (binding
// FILES), keyed by attachment id; the attachments table is the index.
//
// Uploaded files are served from this same origin, so they're handled as untrusted:
//   - only an allowlist of types is accepted (no HTML, SVG or scripts, which a browser could run)
//   - images are shown inline; everything else is sent as a download
//   - every API answer already carries nosniff and CSP default-src 'none' (index.js)
// Downloads need a signed-in team member, like every other API call.
import { atLeast } from '../lib/auth.js'
import { badRequest, conflict, forbidden, HttpError, json, newId, notFound } from '../lib/http.js'
import { getItem } from '../lib/items.js'

const MAX_BYTES = 15 * 1024 * 1024
const MAX_PER_ITEM = 25
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
// type → allowed extensions. CAD formats arrive as application/octet-stream, so for those the
// extension decides.
const ALLOWED = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/gif': ['gif'], 'image/webp': ['webp'], 'image/heic': ['heic'],
  'application/pdf': ['pdf'], 'text/plain': ['txt', 'log'], 'text/csv': ['csv'],
  'application/zip': ['zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  // Browsers send no type (or an odd one) for CAD files and sometimes for ordinary ones; the app
  // then sends application/octet-stream and the extension decides. Served as a download.
  'application/octet-stream': ['step', 'stp', 'stl', 'dxf', 'dwg', 'f3d', 'sldprt', 'sldasm', 'iges', 'igs', 'zip', 'heic', 'pdf', 'csv', 'txt', 'xlsx', 'docx', 'pptx', 'png', 'jpg', 'jpeg'],
}

function requireStorage(env) {
  if (!env.FILES) throw new HttpError(503, 'File storage isn’t set up on this server (R2 bucket, see README).', 'files_not_configured')
}

function cleanFilename(raw) {
  let name = ''
  try { name = decodeURIComponent(raw || '') } catch { name = '' }
  // No path pieces, control characters or quotes; no leading dots (hidden files, "../").
  name = name.replace(/[\\/\u0000-\u001f\u007f"]/g, '').replace(/^[.\s]+/, '').trim().slice(-120)
  if (!name) throw badRequest('The file needs a name.')
  return name
}

const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '')

// Deletes the stored files for these items (and their subitems' files). Call before deleting
// the rows: once the rows cascade away, the R2 keys can't be found any more.
export async function deleteFilesForItems(env, itemIds) {
  if (!env.FILES || !itemIds.length) return
  const ph = itemIds.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(
    `SELECT id FROM attachments WHERE item_id IN (${ph}) OR item_id IN (SELECT id FROM items WHERE parent_id IN (${ph}))`
  ).bind(...itemIds, ...itemIds).all()
  for (let i = 0; i < results.length; i += 1000) await env.FILES.delete(results.slice(i, i + 1000).map((r) => r.id))
}

export async function deleteFilesForBoard(env, boardId) {
  if (!env.FILES) return
  const { results } = await env.DB.prepare('SELECT a.id FROM attachments a JOIN items i ON i.id = a.item_id WHERE i.board_id = ?').bind(boardId).all()
  for (let i = 0; i < results.length; i += 1000) await env.FILES.delete(results.slice(i, i + 1000).map((r) => r.id))
}

export function attachmentRoutes(router, authed) {
  router.get('/api/items/:id/attachments', authed(async (request, env) => {
    const item = await getItem(env, request.params.id)
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.filename, a.content_type, a.size, a.created_at, a.uploaded_by, u.name AS uploaded_by_name
         FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.item_id = ? ORDER BY a.created_at DESC`
    ).bind(item.id).all()
    return json({ attachments: results.map((a) => ({ ...a, inline: INLINE.has(a.content_type) })) })
  }))

  // Raw body upload: Content-Type is the file's type, X-Filename its (URI-encoded) name.
  router.post('/api/items/:id/attachments', authed(async (request, env, user) => {
    requireStorage(env)
    const item = await getItem(env, request.params.id)
    const filename = cleanFilename(request.headers.get('X-Filename'))
    const type = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase()
    const ext = extOf(filename)
    if (!Object.hasOwn(ALLOWED, type) || !ALLOWED[type].includes(ext)) throw badRequest(`“${filename}” isn’t a file type the hub stores. Images, PDFs, office documents, CSV, ZIP and CAD exports (STEP, STL, DXF…) are fine.`)
    const declared = Number(request.headers.get('Content-Length') || 0)
    if (declared > MAX_BYTES) throw new HttpError(413, 'Files can be up to 15 MB.')
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM attachments WHERE item_id = ?').bind(item.id).first()
    if (count.n >= MAX_PER_ITEM) throw conflict(`A task can have up to ${MAX_PER_ITEM} files.`)
    const body = await request.arrayBuffer()
    if (body.byteLength === 0) throw badRequest('That file is empty.')
    if (body.byteLength > MAX_BYTES) throw new HttpError(413, 'Files can be up to 15 MB.')

    const id = newId('fil')
    await env.FILES.put(id, body, { httpMetadata: { contentType: type } })
    await env.DB.batch([
      env.DB.prepare('INSERT INTO attachments (id, item_id, filename, content_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)').bind(id, item.id, filename, type, body.byteLength, user.id),
      env.DB.prepare('INSERT INTO item_events (item_id, actor_id, field, old_value, new_value) VALUES (?, ?, ?, NULL, ?)').bind(item.id, user.id, 'file', filename),
      env.DB.prepare("UPDATE items SET updated_at = datetime('now') WHERE id = ?").bind(item.id),
    ])
    return json({ attachment: { id, filename, content_type: type, size: body.byteLength, uploaded_by: user.id, uploaded_by_name: user.name, inline: INLINE.has(type), created_at: new Date().toISOString() } }, { status: 201 })
  }))

  router.get('/api/attachments/:id', authed(async (request, env) => {
    requireStorage(env)
    const row = await env.DB.prepare('SELECT a.* FROM attachments a JOIN live_items i ON i.id = a.item_id WHERE a.id = ?').bind(request.params.id).first()
    if (!row) throw notFound('That file')
    const object = await env.FILES.get(row.id)
    if (!object) throw notFound('That file')
    const disposition = INLINE.has(row.content_type) ? 'inline' : 'attachment'
    return new Response(object.body, {
      headers: {
        'Content-Type': INLINE.has(row.content_type) ? row.content_type : 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        'Content-Length': String(row.size),
      },
    })
  }))

  router.delete('/api/attachments/:id', authed(async (request, env, user) => {
    const row = await env.DB.prepare('SELECT a.* FROM attachments a JOIN live_items i ON i.id = a.item_id WHERE a.id = ?').bind(request.params.id).first()
    if (!row) throw notFound('That file')
    if (row.uploaded_by !== user.id && !atLeast(user, 'lead')) throw forbidden('Only the person who uploaded a file, or a lead, can delete it.')
    if (env.FILES) await env.FILES.delete(row.id)
    await env.DB.batch([
      env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(row.id),
      env.DB.prepare('INSERT INTO item_events (item_id, actor_id, field, old_value, new_value) VALUES (?, ?, ?, ?, NULL)').bind(row.item_id, user.id, 'file', row.filename),
    ])
    return json({ ok: true })
  }))
}
