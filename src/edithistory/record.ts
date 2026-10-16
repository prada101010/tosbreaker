import type { CachedEntry, DialogStore } from './config.js'
import { cfg } from './config.js'
import { cloneTl } from './json.js'
import { dirtySet, dlgKey, getDialogStore, scheduleFlush } from './store.js'

function savePeer(acc: inu.Account, store: DialogStore, peerId: number | null): void {
  if (!peerId) return
  try {
    const p = acc.getPeer(peerId)
    if (!p) return
    if (p._ === 'user' && !store.users[p.id]) store.users[p.id] = cloneTl(p)
    // the SDK types peer ids as string | number; store keys stay numeric
    else if (p._ !== 'user' && !store.chats[Number(p.id)]) store.chats[Number(p.id)] = cloneTl(p) as tl.TypeChat
  } catch {}
}

export function resolveMsgDialogId(acc: inu.Account, msg: inu.Message, fallbackDlgId?: number | null): number | null {
  let dId = msg.dialogId
  const sId = msg.senderId
  if (dId !== null && dId > 0 && !msg.out && dId === acc.userId && sId !== null && sId > 0) {
    dId = sId
  }
  if (!dId && fallbackDlgId) dId = fallbackDlgId
  return dId
}

export function recordMessage(
  acc: inu.Account,
  msg: inu.Message,
  opts?: { edit?: boolean, dialogId?: number | null },
): CachedEntry | null {
  if (!cfg.editHistory) return null
  const dlgId = resolveMsgDialogId(acc, msg, opts?.dialogId)
  const msgId = msg.id
  if (!dlgId || msgId <= 0) return null

  const accId = acc.id
  const key = dlgKey(accId, dlgId)
  const store = getDialogStore(accId, dlgId)
  const now = Date.now()
  const raw = cloneTl(msg.raw)

  if (dlgId > 0 && raw._ === 'message' && !raw.out && raw.peer_id?._ === 'peerUser' && raw.peer_id.user_id === acc.userId) {
    raw.peer_id = { _: 'peerUser', user_id: dlgId }
  }

  const prev = store.messages[msgId]
  const edits = prev !== undefined && Array.isArray(prev.edits) ? [...prev.edits] : []

  function mediaSig(r: any): string {
    const m = r?.media
    if (!m) return ''
    if (m._ === 'messageMediaPhoto' && m.photo) return `photo:${m.photo.id}:${m.photo.access_hash ?? ''}`
    if (m._ === 'messageMediaDocument' && m.document) return `doc:${m.document.id}:${m.document.access_hash ?? ''}`
    if (m._ === 'messageMediaWebPage' && m.webpage) return `web:${m.webpage.id ?? m.webpage.url ?? ''}`
    try { return JSON.stringify(m) } catch { return '' }
  }

  if (prev !== undefined && prev.raw._ === 'message' && raw._ === 'message') {
    const oldText = prev.raw.message ?? ''
    const newText = raw.message ?? ''
    const oldEditDate = prev.raw.edit_date ?? 0
    const newEditDate = raw.edit_date ?? 0
    const contentChanged = oldText !== newText || mediaSig(prev.raw) !== mediaSig(raw)
    if ((opts?.edit === true || newEditDate > oldEditDate) && contentChanged) {
      edits.push(cloneTl(prev.raw))
      if (edits.length > 30) edits.shift()
    }
  }

  const entry: CachedEntry = {
    raw,
    edits,
    cachedAt: prev !== undefined ? prev.cachedAt : now,
  }

  store.messages[msgId] = entry
  store.updatedAt = now
  dirtySet.add(key)

  savePeer(acc, store, msg.senderId)
  savePeer(acc, store, dlgId)

  scheduleFlush(opts?.edit === true)
  return entry
}
