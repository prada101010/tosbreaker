import { refreshCells } from './cells.js'
import { cfg, isEntryDeleted } from './config.js'
import { recordMessage } from './record.js'
import { DELETED_MAP, markJavaDeleted, OWN_DELETE_MAP, STATE_MAP, uiHandler } from './state.js'
import { getDialogStore, index, scheduleFlush } from './store.js'

const onUserDeleteMessages = inu.xposed.routine((ctx) => {
  try {
    const list = ctx.args[0]
    if (list === null) return
    for (const mId of list) {
      if (mId !== null) {
        OWN_DELETE_MAP.put('' + mId, '1')
      }
    }
  } catch {}
})

const onBlockDeleteNotification = inu.xposed.routine((ctx) => {
  try {
    if (STATE_MAP.get('seeDeleted') === false) return
    const delEventId = STATE_MAP.get('msgDeletedId')
    if (delEventId === null || ctx.args[0] !== delEventId) return

    const varargs = ctx.args[2]
    if (varargs === null || varargs.length < 2) return
    const msgIds = varargs[0]
    const chId = varargs[1]
    if (msgIds === null) return
    if (varargs.length >= 3 && varargs[2] === true) return

    const chStr = '' + chId
    const isCommon = chStr === '0'
    let allOwn = true
    let count = 0

    for (const mId of msgIds) {
      if (mId === null || mId <= 0) continue
      count++
      const k = '' + mId
      if (OWN_DELETE_MAP.containsKey(k)) {
        OWN_DELETE_MAP.remove(k)
      } else {
        allOwn = false
        if (isCommon) {
          DELETED_MAP.put('0:' + mId, '1')
        } else {
          DELETED_MAP.put('-' + chStr + ':' + mId, '1')
          DELETED_MAP.put('-100' + chStr + ':' + mId, '1')
        }
      }
    }

    if (count > 0 && !allOwn) {
      ctx.setReturnValue(null)
    }
  } catch {}
})

const onMarkDeletedStorage = inu.xposed.routine((ctx) => {
  try {
    if (STATE_MAP.get('seeDeleted') === false) return
    if (OWN_DELETE_MAP.isEmpty()) {
      ctx.setReturnValue(null)
    }
  } catch {}
})

try {
  const mcCls = inu.jvm.cls('org.telegram.messenger.MessagesController')
  inu.xposed.hookAllOverloads(mcCls, 'deleteMessages', {
    before: onUserDeleteMessages,
  })
} catch {}

try {
  const ncCls = inu.jvm.cls('org.telegram.messenger.NotificationCenter')
  inu.xposed.hookAllOverloads(ncCls, 'postNotificationNameInternal', {
    before: onBlockDeleteNotification,
  })
} catch {}

try {
  const caCls = inu.jvm.cls('org.telegram.ui.ChatActivity')
  inu.xposed.hookAllOverloads(caCls, 'didReceivedNotification', {
    before: onBlockDeleteNotification,
  })
} catch {}

try {
  const msCls = inu.jvm.cls('org.telegram.messenger.MessagesStorage')
  inu.xposed.hookAllOverloads(msCls, 'markMessagesAsDeleted', {
    before: onMarkDeletedStorage,
  })
} catch {}

const ownDeleteSet = new Set<string>()

inu.interceptRpc('messages.deleteMessages', async (ctx, next) => {
  for (const id of ctx.request.id ?? []) {
    ownDeleteSet.add(`${ctx.account.id}:0:${id}`)
    OWN_DELETE_MAP.call('put', `${id}`, '1')
  }
  return await next()
})

inu.interceptRpc('channels.deleteMessages', async (ctx, next) => {
  const chId = (ctx.request.channel as any)?.channel_id
  if (typeof chId === 'number') {
    const dlgId = -1000000000000 - chId
    for (const id of ctx.request.id ?? []) {
      ownDeleteSet.add(`${ctx.account.id}:${dlgId}:${id}`)
      OWN_DELETE_MAP.call('put', `${id}`, '1')
    }
  }
  return await next()
})

function processDeletions(acc: inu.Account, dlgId: number | null, rawIds: number[]): boolean {
  if (!cfg.seeDeleted) return false
  const ids = rawIds.filter(id => id > 0)
  if (ids.length === 0) return false

  const accId = acc.id
  const now = Date.now()

  const selfTriggered = ids.every((id) => {
    const k = dlgId !== null ? `${accId}:${dlgId}:${id}` : `${accId}:0:${id}`
    if (!ownDeleteSet.has(k) && !OWN_DELETE_MAP.call('containsKey', `${id}`)) return false
    ownDeleteSet.delete(k)
    OWN_DELETE_MAP.call('remove', `${id}`)
    return true
  })
  if (selfTriggered) return false

  if (dlgId !== null && dlgId !== 0) {
    const store = getDialogStore(accId, dlgId)
    const missing = ids.filter(id => store.messages[id] === undefined)
    if (missing.length > 0) {
      try {
        for (const m of acc.getMessagesCached(dlgId, missing)) {
          if (!m) continue
          recordMessage(acc, m, { deleted: true, deletedAt: now, dialogId: dlgId })
        }
      } catch {}
    }
    for (const id of ids) {
      const rec = store.messages[id]
      if (rec !== undefined) {
        recordMessage(acc, new inu.Message(rec.raw), {
          deleted: true,
          deletedAt: isEntryDeleted(rec) ? (rec.deletedAt as number) : now,
          dialogId: dlgId,
        })
      } else {
        markJavaDeleted(dlgId, store.simpleId, id, false)
      }
    }
  } else {
    const unknown: number[] = []
    for (const id of ids) {
      const mappedDlg = index.msgToDialog[`${accId}:${id}`]
      if (typeof mappedDlg === 'number' && mappedDlg !== 0) {
        const store = getDialogStore(accId, mappedDlg)
        const rec = store.messages[id]
        if (rec !== undefined) {
          recordMessage(acc, new inu.Message(rec.raw), {
            deleted: true,
            deletedAt: isEntryDeleted(rec) ? (rec.deletedAt as number) : now,
            dialogId: mappedDlg,
          })
          continue
        }
      }
      unknown.push(id)
    }
    if (unknown.length > 0) {
      try {
        const cached = acc.getMessagesCached(0, unknown)
        for (let i = 0; i < unknown.length; i++) {
          const id = unknown[i]
          const m = cached[i]
          if (m) {
            recordMessage(acc, m, { deleted: true, deletedAt: now })
          }
          markJavaDeleted(m?.dialogId ?? null, null, id, true)
        }
      } catch {
        for (const id of unknown) {
          markJavaDeleted(null, null, id, true)
        }
      }
    }
  }

  scheduleFlush(true)
  try {
    uiHandler.call('post', refreshCells)
  } catch {}
  return true
}

inu.interceptUpdate('updateDeleteMessages', ({ update, account }) => {
  return processDeletions(account, null, Array.from(update.messages ?? [])) ? 'drop' : 'deliver'
})

inu.interceptUpdate('updateDeleteChannelMessages', ({ update, account }) => {
  const dlgId = -1000000000000 - update.channel_id
  return processDeletions(account, dlgId, Array.from(update.messages ?? [])) ? 'drop' : 'deliver'
})

inu.interceptRpc('updates.getDifference', async (ctx, next) => {
  const res = await next()
  if (!res || !cfg.seeDeleted) return res
  if (res._ === 'updates.difference' || res._ === 'updates.differenceSlice') {
    const list = res.other_updates
    if (Array.isArray(list) && list.length > 0) {
      res.other_updates = list.filter((u) => {
        if (u._ === 'updateDeleteMessages') {
          return !processDeletions(ctx.account, null, Array.from(u.messages ?? []))
        }
        if (u._ === 'updateDeleteChannelMessages') {
          return !processDeletions(ctx.account, -1000000000000 - u.channel_id, Array.from(u.messages ?? []))
        }
        return true
      })
    }
  }
  return res
})

inu.interceptRpc('updates.getChannelDifference', async (ctx, next) => {
  const res = await next()
  if (!res || !cfg.seeDeleted) return res
  if (res._ === 'updates.channelDifference' || res._ === 'updates.channelDifferenceTooLong') {
    const list = (res as any).other_updates
    if (Array.isArray(list) && list.length > 0) {
      ;(res as any).other_updates = list.filter((u: tl.TypeUpdate) => {
        if (u._ === 'updateDeleteChannelMessages') {
          return !processDeletions(ctx.account, -1000000000000 - u.channel_id, Array.from(u.messages ?? []))
        }
        return true
      })
    }
  }
  return res
})
