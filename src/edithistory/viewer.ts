import { cfg } from './config.js'
import { cloneTl } from './json.js'
import { resolveMsgDialogId } from './record.js'
import { getDialogStore } from './store.js'

inu.registerMessageAction({
  id: 'inuedithistory-view',
  text: 'Edited History',
  icon: inu.icons.common('edit'),
  placements: ['bubble'],
  visible: (ctx) => {
    if (!cfg.editHistory) return false
    const m = ctx.messages[0]
    if (!m) return false
    const dlgId = resolveMsgDialogId(ctx.account, m, ctx.dialogId) ?? ctx.dialogId
    const rec = getDialogStore(ctx.account.id, dlgId).messages[m.id]
    return Boolean(rec !== undefined && rec.edits.length > 0)
  },
  callback: (ctx) => {
    const m = ctx.messages[0]
    if (!m) return
    const dlgId = resolveMsgDialogId(ctx.account, m, ctx.dialogId) ?? ctx.dialogId
    const store = getDialogStore(ctx.account.id, dlgId)
    const rec = store.messages[m.id]
    if (!rec || rec.edits.length === 0) return

    const versions = [...rec.edits, rec.raw].reverse().map((raw, idx) => {
      const copy = cloneTl(raw)
      if (copy._ === 'message' && copy.edit_date) {
        copy.date = copy.edit_date
        delete copy.edit_date
      }
      return {
        key: `${dlgId}:${m.id}:v${idx}`,
        message: copy,
      }
    })

    inu.ui.openChatHistory({
      title: 'Edited Message History',
      subtitle: `${versions.length} versions`,
      icon: inu.icons.common('edit'),
      account: ctx.account.id,
      synthetic: true,
      avatars: dlgId < 0,
      // v44 SDK takes a single `load(cursor, direction)` provider; v45's loadAround/loadMore collapse into it
      load: cursor => (cursor !== null
        ? { entries: [] }
        : {
            entries: versions,
            users: Object.values(store.users).map(u => cloneTl(u)),
            chats: Object.values(store.chats).map(c => cloneTl(c)),
          }),
    })
  },
})
