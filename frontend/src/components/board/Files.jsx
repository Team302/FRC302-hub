// A task's files: drop or pick files to upload; images preview inline, everything else downloads.
// Files are fetched with the session token (they aren't public), then shown from a blob URL.
import { useEffect, useRef, useState } from 'react'
import { Download, FileText, ImageIcon, Paperclip, Trash2, UploadCloud } from 'lucide-react'
import { apiFetch, del, downloadFile, get } from '../../lib/api'
import { useSession } from '../../context/Session'
import { useToast } from '../../context/ToastContext'
import { atLeast } from '../../lib/constants'
import { parseServerTime, relative } from '../../lib/format'

const MAX_BYTES = 15 * 1024 * 1024
// Types the server accepts as themselves; anything else goes up as a generic file and the
// server checks the extension (CAD files, Windows' x-zip-compressed, files with no type).
const KNOWN = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])

const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`)

function Thumb({ file }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let url
    apiFetch(`/api/attachments/${file.id}`).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) { url = URL.createObjectURL(b); setSrc(url) } }).catch(() => {})
    return () => url && URL.revokeObjectURL(url)
  }, [file.id])
  return src ? <img src={src} alt={file.filename} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-brand-gray-300" />
}

export default function Files({ itemId, onChanged }) {
  const { user } = useSession()
  const { success, error } = useToast()
  const [files, setFiles] = useState(null)
  const [uploading, setUploading] = useState(0)
  const [over, setOver] = useState(false)
  const input = useRef(null)
  const load = () => get(`/items/${itemId}/attachments`).then((d) => setFiles(d.attachments)).catch(() => setFiles([]))
  useEffect(() => { load() }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(list) {
    for (const f of list) {
      if (f.size > MAX_BYTES) { error(`${f.name} is too big`, 'Files can be up to 15 MB.'); continue }
      setUploading((n) => n + 1)
      try {
        const res = await apiFetch(`/api/items/${itemId}/attachments`, {
          method: 'POST', body: f,
          headers: { 'Content-Type': KNOWN.has(f.type) ? f.type : 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status}).`)
        setFiles((cur) => [data.attachment, ...(cur || [])])
        onChanged?.()
      } catch (e) {
        error(`Couldn’t upload ${f.name}`, e.message)
      } finally { setUploading((n) => n - 1) }
    }
  }
  async function download(f) {
    try { await downloadFile(`/api/attachments/${f.id}`, f.filename) } catch (e) { error('Couldn’t download', e.message) }
  }
  async function remove(f) {
    try { await del(`/attachments/${f.id}`); setFiles((cur) => cur.filter((x) => x.id !== f.id)); success('File deleted'); onChanged?.() } catch (e) { error('Couldn’t delete', e.message) }
  }

  return (
    <div className="space-y-4">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]) }}
        className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${over ? 'border-accent-500 bg-accent-50' : 'border-brand-gray-200'}`}>
        <UploadCloud className="w-6 h-6 mx-auto text-brand-gray-400" />
        <p className="text-sm mt-2">Drop files here or <button type="button" className="link" onClick={() => input.current?.click()}>choose files</button></p>
        <p className="text-xs text-brand-gray-500 mt-1">Photos, PDFs, office documents, CSV, ZIP and CAD exports (STEP, STL, DXF). Up to 15 MB each.</p>
        {uploading > 0 && <p className="text-xs text-accent-700 mt-2">Uploading {uploading} {uploading === 1 ? 'file' : 'files'}…</p>}
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => { upload([...e.target.files]); e.target.value = '' }} />
      </div>
      {!files ? <div className="skeleton h-16 rounded-xl" /> : files.length === 0 ? (
        <p className="text-sm text-brand-gray-500 text-center py-2"><Paperclip className="w-4 h-4 inline mr-1" />No files yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((f) => (
            <li key={f.id} className="card flex items-center gap-3 p-2">
              <button type="button" onClick={() => download(f)} className="w-14 h-14 rounded-lg bg-brand-gray-100 overflow-hidden flex items-center justify-center shrink-0" aria-label={`Download ${f.filename}`}>
                {f.inline ? <Thumb file={f} /> : <FileText className="w-5 h-5 text-brand-gray-400" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" title={f.filename}>{f.filename}</p>
                <p className="text-xs text-brand-gray-500 truncate">{size(f.size)} · {f.uploaded_by_name || 'Former member'} · {relative(parseServerTime(f.created_at))}</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => download(f)} aria-label={`Download ${f.filename}`}><Download className="w-4 h-4" /></button>
              {(f.uploaded_by === user.id || atLeast(user, 'lead')) && <button type="button" className="btn-icon" onClick={() => remove(f)} aria-label={`Delete ${f.filename}`}><Trash2 className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
