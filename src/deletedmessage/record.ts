import type { CachedEntry, DialogStore } from './config.js'
import { isEntryDeleted, MAX_MEDIA_BYTES, MEDIA_DIR } from './config.js'
import { cloneTl } from './json.js'
import { isCommonBoxDialog, markJavaDeleted } from './state.js'
import { dirtySet, dlgKey, getDialogStore, index, markIndexDirty, scheduleFlush } from './store.js'

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

async function cacheMediaFile(acc: inu.Account, msg: inu.Message, rec: CachedEntry, key: string): Promise<void> {
  if (rec.mediaPath && inu.fs.exists(rec.mediaPath)) return
  const kind = msg.mediaType
  if (!kind) return
  try {
    if (inu.fs.usage() > inu.fs.quota() * 0.85) return
  } catch {
    return
  }

  const doc = msg.document
  if (doc && doc._ === 'document' && doc.size > MAX_MEDIA_BYTES) return

  const allow =
    isEntryDeleted(rec)
    || kind === 'voice'
    || kind === 'roundVideo'
    || kind === 'photo'
    || kind === 'sticker'
    || kind === 'gif'
    || (doc && doc._ === 'document' && doc.size <= MAX_MEDIA_BYTES)

  if (!allow) return

  try {
    const file = await acc.downloadMedia(msg)
    try {
      if (file.size <= MAX_MEDIA_BYTES) {
        const name = (file.name || `${kind}.bin`).replace(/[^A-Za-z0-9._-]/g, '_')
        const path = `${MEDIA_DIR}/${key}_${msg.id}_${name}`
        inu.fs.write(path, file)
        rec.mediaPath = path
        dirtySet.add(key)
        scheduleFlush(false)
      }
    } finally {
      file.dispose()
    }
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
  opts?: { deleted?: boolean, deletedAt?: number, dialogId?: number | null },
): CachedEntry | null {
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
  const wasDeleted = isEntryDeleted(prev)
  const isOutMsg = Boolean(raw._ === 'message' && raw.out && isCommonBoxDialog(dlgId))
  const isDel = !isOutMsg && (opts?.deleted === true || wasDeleted)
  const delAt = isDel ? (opts?.deletedAt ?? (wasDeleted ? (prev.deletedAt as number) : now)) : null

  const entry: CachedEntry = {
    raw,
    cachedAt: prev !== undefined ? prev.cachedAt : now,
    deletedAt: delAt,
    mediaPath: prev !== undefined ? prev.mediaPath : null,
  }

  store.messages[msgId] = entry
  store.updatedAt = now
  dirtySet.add(key)

  if (isCommonBoxDialog(dlgId)) {
    index.msgToDialog[`${accId}:${msgId}`] = dlgId
    markIndexDirty()
  }

  savePeer(acc, store, msg.senderId)
  savePeer(acc, store, dlgId)

  if (delAt !== null) {
    index.deleted[`${accId}:${dlgId}:${msgId}`] = {
      accountId: accId,
      dialogId: dlgId,
      simpleId: store.simpleId,
      msgId,
      deletedAt: delAt,
    }
    markIndexDirty()
    markJavaDeleted(dlgId, store.simpleId, msgId, isCommonBoxDialog(dlgId))
  }

  scheduleFlush(opts?.deleted === true)
  void cacheMediaFile(acc, msg, entry, key)
  return entry
}
