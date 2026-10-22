// Board state and every write a board makes. Edits are optimistic: the change shows at once and
// is rolled back (with the server's reason in a toast) if the server refuses it. The board also
// refreshes itself every 20 seconds while the tab is visible, so teammates' changes appear.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, del, get, patch, post, put } from '../../lib/api'
import { useToast } from '../../context/ToastContext'

const REFRESH_MS = 20000

export default function useBoard(boardId) {
  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const { error: toastError } = useToast()
  const pending = useRef(0)

  const load = useCallback(async () => {
    try {
      const d = await get(`/boards/${boardId}`)
      // Don't let a background refresh land on top of an edit that is still in flight.
      if (pending.current === 0) setData(d)
    } catch (e) {
      if (e.status === 404) setMissing(true)
    }
  }, [boardId])

  useEffect(() => { setData(null); setMissing(false); load() }, [load])
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const t = setInterval(tick, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  // Runs `request` with `optimistic` applied first; restores the snapshot on failure.
  const mutate = useCallback(async (optimistic, request, apply) => {
    let snapshot
    setData((d) => { snapshot = d; return optimistic ? optimistic(d) : d })
    pending.current++
    try {
      const res = await request()
      if (apply) setData((d) => apply(d, res))
      return res
    } catch (e) {
      setData(snapshot)
      toastError('Couldn’t save that', e.message)
      return undefined
    } finally {
      pending.current--
    }
  }, [toastError])

  const replaceItem = (d, item) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...item } : i)) })

  const actions = {
    reload: load,

    updateItem: (id, changes) => mutate(
      (d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...changes } : i)) }),
      () => patch(`/items/${id}`, changes),
      // Automations can move or reassign the item, so take the server's version, and the
      // subitems' group if the parent moved.
      (d, res) => {
        const next = replaceItem(d, res.item)
        return { ...next, items: next.items.map((i) => (i.parent_id === id ? { ...i, group_id: res.item.group_id } : i)) }
      },
    ),

    setValue: (itemId, columnId, value) => mutate(
      (d) => ({ ...d, values: { ...d.values, [itemId]: { ...(d.values[itemId] || {}), [columnId]: value } } }),
      () => put(`/items/${itemId}/values/${columnId}`, { value }),
      (d, res) => ({ ...d, values: { ...d.values, [itemId]: { ...(d.values[itemId] || {}), [columnId]: res.value } } }),
    ),

    addItem: (fields) => mutate(null, () => post('/items', { board_id: boardId, ...fields }), (d, res) => ({ ...d, items: [...d.items, res.item] })),

    deleteItems: (ids) => mutate(
      (d) => ({ ...d, items: d.items.filter((i) => !ids.includes(i.id) && !ids.includes(i.parent_id)) }),
      () => (ids.length === 1 ? del(`/items/${ids[0]}`) : post('/items/bulk', { ids, action: 'delete' })),
    ),

    // Undo for a delete: the tasks come back from the trash with their subitems and values.
    restoreItems: async (ids) => {
      const res = await mutate(null, () => post('/items/restore', { ids }))
      if (res) await load()
      return res
    },

    bulkUpdate: (ids, changes) => mutate(
      (d) => ({ ...d, items: d.items.map((i) => (ids.includes(i.id) ? { ...i, ...(i.parent_id ? { ...changes, group_id: i.group_id } : changes) } : i)) }),
      () => post('/items/bulk', { ids, action: 'update', changes }),
      (d, res) => res.items.reduce(replaceItem, d),
    ),

    // Copies carry values and subitems, so reload rather than splice them in.
    duplicate: async (ids) => {
      const res = await mutate(null, () => post('/items/bulk', { ids, action: 'duplicate' }))
      if (res) await load()
      return res
    },

    // New order for one group (top-level items) or one parent's subitems.
    reorder: ({ groupId, parentId, ids }) => mutate(
      (d) => {
        const pos = Object.fromEntries(ids.map((id, i) => [id, i]))
        return { ...d, items: d.items.map((i) => (i.id in pos ? { ...i, position: pos[i.id], ...(groupId ? { group_id: groupId } : {}) } : (groupId && ids.includes(i.parent_id) ? { ...i, group_id: groupId } : i))) }
      },
      () => post('/items/order', { group_id: groupId || null, parent_id: parentId || null, ids }),
    ),

    // Groups
    addGroup: (name) => mutate(null, () => post(`/boards/${boardId}/groups`, { name, color: 'blue' }), (d, res) => ({ ...d, groups: [...d.groups, res.group] })),
    updateGroup: (id, changes) => mutate(
      (d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, ...changes } : g)) }),
      () => patch(`/groups/${id}`, changes),
    ),
    deleteGroup: (id) => mutate((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== id) }), () => del(`/groups/${id}`)),
    reorderGroups: (ids) => mutate(
      (d) => ({ ...d, groups: ids.map((id) => d.groups.find((g) => g.id === id)) }),
      () => post(`/boards/${boardId}/groups/order`, { ids }),
    ),

    // Columns
    addColumn: (fields) => mutate(null, () => post(`/boards/${boardId}/columns`, fields), (d, res) => ({ ...d, columns: [...d.columns, res.column] })),
    updateColumn: (id, changes) => mutate(
      (d) => ({ ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, ...changes } : c)) }),
      () => patch(`/columns/${id}`, changes),
      // Removing a label clears the values that used it; take the server's word for both.
      (d, res) => { if (changes.settings) load(); return { ...d, columns: d.columns.map((c) => (c.id === id ? res.column : c)) } },
    ),
    deleteColumn: (id) => mutate((d) => ({ ...d, columns: d.columns.filter((c) => c.id !== id) }), () => del(`/columns/${id}`)),
    reorderColumns: (ids) => mutate(
      (d) => ({ ...d, columns: ids.map((id) => d.columns.find((c) => c.id === id)) }),
      () => post(`/boards/${boardId}/columns/order`, { ids }),
    ),

    updateBoard: (changes) => mutate(
      (d) => ({ ...d, board: { ...d.board, ...changes } }),
      () => patch(`/boards/${boardId}`, changes),
      (d, res) => ({ ...d, board: res.board }),
    ),
    setFavorite: (favorite) => api(`/boards/${boardId}/favorite`, { method: 'PUT', body: { favorite } }),
  }

  return { data, missing, ...actions }
}
