import { cfg } from './config.js'
import { cloneTl } from './json.js'
import { recordMessage, resolveMsgDialogId } from './record.js'
import { getDialogStore } from './store.js'

inu.interceptRpc('messages.getHistory', async (ctx, next) => {
  const res = await next()
  if (!res || res._ === 'messages.messagesNotModified' || !cfg.editHistory) return res

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
    if (dlgId) {
      const store = getDialogStore(acc.id, dlgId)
      for (const u of res.users ?? []) {
        if (u._ === 'user') store.users[u.id] = cloneTl(u)
      }
      for (const c of res.chats ?? []) {
        if ('id' in c) store.chats[c.id] = cloneTl(c)
      }
    }
  } catch {}
  return res
})
