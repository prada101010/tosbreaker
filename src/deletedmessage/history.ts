import { refreshCells } from './cells.js'
import { cfg, isEntryDeleted } from './config.js'
import { cloneTl } from './json.js'
import { recordMessage, resolveMsgDialogId } from './record.js'
import { isCommonBoxDialog, markJavaDeleted, uiHandler } from './state.js'
import { getDialogStore, index } from './store.js'

inu.interceptRpc('messages.getHistory', async (ctx, next) => {
  const res = await next()
  if (!res || res._ === 'messages.messagesNotModified') return res

  try {
    const acc = ctx.account
    const req = ctx.request
    let dlgId: number | null = null
    try {
      dlgId = inu.utils.peers.getMarkedPeerId(req.peer)
    } catch {
      const p = acc.resolvePeerCached(req.peer)
      if (p) dlgId = inu.utils.peers.getMarkedPeerId(p)
    }

    const list = res.messages ?? []
    for (const raw of list) {
      if (raw._ !== 'messageEmpty') {
        const wrapped = new inu.Message(raw)
        if (!dlgId) dlgId = resolveMsgDialogId(acc, wrapped)
        recordMessage(acc, wrapped, { dialogId: dlgId })
      }
    }
    if (!dlgId || !cfg.seeDeleted) return res

    const store = getDialogStore(acc.id, dlgId)
    for (const u of res.users ?? []) {
      if (u._ === 'user') store.users[u.id] = cloneTl(u)
    }
    for (const c of res.chats ?? []) {
      if ('id' in c) store.chats[c.id] = cloneTl(c)
    }

    const seen = new Set<number>()
    let minId = Number.MAX_SAFE_INTEGER
    let maxId = 0
    for (const m of list) {
      if (m._ !== 'messageEmpty') seen.add(m.id)
      if (m.id < minId) minId = m.id
      if (m.id > maxId) maxId = m.id
    }

    const limit = req.limit > 0 ? req.limit : 50
    const addOffset = (req as any).add_offset ?? 0
    const hi = (req.offset_id > 0 && addOffset >= 0)
      ? Math.max(req.offset_id, maxId)
      : (req.max_id > 0 ? req.max_id : Number.MAX_SAFE_INTEGER)
    const lo = req.min_id > 0 ? req.min_id : 0

    const inject: tl.TypeMessage[] = []
    for (const rec of Object.values(store.messages)) {
      if (!isEntryDeleted(rec)) continue
      const id = rec.raw.id
      markJavaDeleted(dlgId, store.simpleId, id, isCommonBoxDialog(dlgId))
      if (seen.has(id) || id > hi) continue
      const copy = cloneTl(rec.raw)
      if (copy._ === 'message' && copy.media) delete (copy.media as any).ttl_seconds
      inject.push(copy)
    }

    if (inject.length > 0) {
      const injectIds = new Set(inject.map(m => m.id))
      const merged = list.filter(m => !(m._ === 'messageEmpty' && injectIds.has(m.id)))
      merged.push(...inject)
      merged.sort((a, b) => b.id - a.id)
      res.messages = merged
      if ('count' in res && typeof res.count === 'number' && res.count < merged.length) {
        res.count = merged.length
      }

      const uIds = new Set((res.users ?? []).map(u => u.id))
      const cIds = new Set((res.chats ?? []).map(c => c.id))
      const users = Array.from(res.users ?? [])
      const chats = Array.from(res.chats ?? [])

      for (const u of Object.values(store.users)) {
        if (!uIds.has(u.id)) {
          users.push(cloneTl(u))
          uIds.add(u.id)
        }
      }
      for (const c of Object.values(store.chats)) {
        if (!cIds.has(c.id)) {
          chats.push(cloneTl(c))
          cIds.add(c.id)
        }
      }
      res.users = users
      res.chats = chats
    }

    setTimeout(() => {
      try {
        uiHandler.call('post', refreshCells)
      } catch {}
    }, 100)
  } catch {}
  return res
})

inu.interceptRpc('messages.getMessages', async (ctx, next) => {
  const res = await next()
  if (!res || res._ === 'messages.messagesNotModified' || !cfg.seeDeleted) return res
  try {
    const accId = ctx.account.id
    const list = Array.from(res.messages ?? [])
    let mod = false
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      if (m._ !== 'messageEmpty') continue
      const dlgId = index.msgToDialog[`${accId}:${m.id}`]
      if (!dlgId) continue
      const rec = getDialogStore(accId, dlgId).messages[m.id]
      if (rec !== undefined) {
        list[i] = cloneTl(rec.raw)
        mod = true
      }
    }
    if (mod) res.messages = list
  } catch {}
  return res
})

inu.interceptRpc('channels.getMessages', async (ctx, next) => {
  const res = await next()
  if (!res || res._ === 'messages.messagesNotModified' || !cfg.seeDeleted) return res
  try {
    const chId = (ctx.request.channel as any)?.channel_id
    if (typeof chId !== 'number') return res
    const store = getDialogStore(ctx.account.id, -1000000000000 - chId)
    const list = Array.from(res.messages ?? [])
    let mod = false
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      if (m._ !== 'messageEmpty') continue
      const rec = store.messages[m.id]
      if (rec !== undefined) {
        list[i] = cloneTl(rec.raw)
        mod = true
      }
    }
    if (mod) res.messages = list
  } catch {}
  return res
})
