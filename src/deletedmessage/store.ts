import type { DialogStore, IndexStore } from './config.js'
import { CACHE_DIR, DLG_DIR, IDX_FILE, isEntryDeleted, MEDIA_DIR, TTL_MS } from './config.js'
import { decodeJson, encodeJson } from './json.js'
import { DELETED_MAP, isCommonBoxDialog, markJavaDeleted } from './state.js'

function ensureDirs(): void {
  try {
    if (!inu.fs.exists(CACHE_DIR)) inu.fs.mkdir(CACHE_DIR)
    if (!inu.fs.exists(DLG_DIR)) inu.fs.mkdir(DLG_DIR)
    if (!inu.fs.exists(MEDIA_DIR)) inu.fs.mkdir(MEDIA_DIR)
  } catch {}
}

ensureDirs()

// eslint-disable-next-line import/no-mutable-exports -- loadIndex() swaps the object in wholesale
export let index: IndexStore = {
  lastCleanup: 0,
  msgToDialog: {},
  deleted: {},
  dialogs: {},
}

const memDialogs = new Map<string, DialogStore>()
export const dirtySet = new Set<string>()
let idxDirty = false
let flushId: number | null = null

/** record.ts mutates the index object; the flag itself has to be flipped from this module. */
export function markIndexDirty(): void {
  idxDirty = true
}

export function dlgKey(accId: number, dlgId: number): string {
  return `${accId}_${dlgId}`
}

function dlgPath(key: string): string {
  return `${DLG_DIR}/${key}.json`
}

function loadIndex(): void {
  try {
    if (inu.fs.exists(IDX_FILE)) {
      const data = decodeJson<IndexStore>(inu.fs.read(IDX_FILE))
      if (data && typeof data === 'object') {
        index = {
          lastCleanup: data.lastCleanup ?? 0,
          msgToDialog: data.msgToDialog ?? {},
          deleted: data.deleted ?? {},
          dialogs: data.dialogs ?? {},
        }
      }
    }
  } catch {}

  for (const item of Object.values(index.deleted)) {
    if (typeof item.deletedAt === 'number' && item.deletedAt > 0) {
      markJavaDeleted(item.dialogId, item.simpleId, item.msgId, isCommonBoxDialog(item.dialogId))
    }
  }
}

loadIndex()

export function getDialogStore(accId: number, dlgId: number): DialogStore {
  const key = dlgKey(accId, dlgId)
  const hit = memDialogs.get(key)
  if (hit) return hit

  const path = dlgPath(key)
  if (inu.fs.exists(path)) {
    try {
      const data = decodeJson<DialogStore>(inu.fs.read(path))
      if (data && data.messages) {
        memDialogs.set(key, data)
        return data
      }
    } catch {}
  }

  const store: DialogStore = {
    accountId: accId,
    dialogId: dlgId,
    simpleId: inu.utils.peers.toSimpleDialogId(dlgId),
    updatedAt: Date.now(),
    messages: {},
    users: {},
    chats: {},
  }
  memDialogs.set(key, store)
  return store
}

function flushDisk(): void {
  if (flushId !== null) {
    clearTimeout(flushId)
    flushId = null
  }
  ensureDirs()

  for (const key of dirtySet) {
    const store = memDialogs.get(key)
    if (!store) continue
    try {
      inu.fs.write(dlgPath(key), encodeJson(store))
      index.dialogs[key] = store.updatedAt
      idxDirty = true
    } catch {}
  }
  dirtySet.clear()

  if (idxDirty) {
    try {
      inu.fs.write(IDX_FILE, encodeJson(index))
      idxDirty = false
    } catch {}
  }

  if (memDialogs.size > 24) {
    const keys = Array.from(memDialogs.keys())
    for (let i = 0; i < keys.length - 16; i++) {
      if (!dirtySet.has(keys[i])) memDialogs.delete(keys[i])
    }
  }
}

export function scheduleFlush(now = false): void {
  if (now) {
    flushDisk()
    return
  }
  if (flushId !== null) return
  flushId = setTimeout(() => {
    flushId = null
    flushDisk()
  }, 1500)
}

function purgeExpired(): void {
  const now = Date.now()
  if (now - index.lastCleanup < 3600_000) return
  const cutoff = now - TTL_MS

  for (const [k, v] of Object.entries(index.deleted)) {
    if (v.deletedAt < cutoff) {
      delete index.deleted[k]
      DELETED_MAP.call('remove', `${v.simpleId}:${v.msgId}`)
      DELETED_MAP.call('remove', `${v.dialogId}:${v.msgId}`)
      DELETED_MAP.call('remove', `0:${v.msgId}`)
      idxDirty = true
    }
  }

  for (const [key, upd] of Object.entries(index.dialogs)) {
    const path = dlgPath(key)
    if (!inu.fs.exists(path)) {
      delete index.dialogs[key]
      idxDirty = true
      continue
    }
    if (upd < cutoff) {
      try {
        const store = decodeJson<DialogStore>(inu.fs.read(path))
        for (const rec of Object.values(store.messages ?? {})) {
          if (rec.mediaPath && inu.fs.exists(rec.mediaPath)) inu.fs.rm(rec.mediaPath)
          delete index.msgToDialog[`${store.accountId}:${rec.raw.id}`]
        }
      } catch {}
      inu.fs.rm(path)
      memDialogs.delete(key)
      dirtySet.delete(key)
      delete index.dialogs[key]
      idxDirty = true
      continue
    }

    try {
      const [aStr, dStr] = key.split('_')
      const store = getDialogStore(Number(aStr), Number(dStr))
      let mod = false
      for (const [mId, rec] of Object.entries(store.messages)) {
        const ts = isEntryDeleted(rec) ? (rec.deletedAt as number) : rec.cachedAt
        if (ts < cutoff) {
          if (rec.mediaPath && inu.fs.exists(rec.mediaPath)) inu.fs.rm(rec.mediaPath)
          delete store.messages[Number(mId)]
          delete index.msgToDialog[`${store.accountId}:${mId}`]
          mod = true
        }
      }
      if (mod) {
        if (Object.keys(store.messages).length === 0) {
          inu.fs.rm(path)
          memDialogs.delete(key)
          dirtySet.delete(key)
          delete index.dialogs[key]
        } else {
          dirtySet.add(key)
        }
        idxDirty = true
      }
    } catch {}
  }

  try {
    if (inu.fs.exists(MEDIA_DIR)) {
      for (const f of inu.fs.readdir(MEDIA_DIR)) {
        const p = `${MEDIA_DIR}/${f}`
        if (inu.fs.stat(p).mtime < cutoff) inu.fs.rm(p)
      }
    }
  } catch {}

  index.lastCleanup = now
  idxDirty = true
  flushDisk()
}

const initTimer = setTimeout(purgeExpired, 4000)
const loopTimer = setInterval(purgeExpired, 6 * 3600_000)

inu.onUnload(() => {
  clearTimeout(initTimer)
  clearInterval(loopTimer)
  flushDisk()
})
