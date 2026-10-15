import { cfg, isEntryDeleted } from './config.js'
import { cloneTl } from './json.js'
import { getDialogStore } from './store.js'

inu.registerChatAction({
  id: 'inudeleted-deleted-messages',
  text: 'Deleted Messages',
  icon: inu.icons.common('delete'),
  visible: () => cfg.seeDeleted,
  callback: (ctx) => {
    const store = getDialogStore(ctx.account.id, ctx.dialogId)
    const list = Object.values(store.messages)
      .filter(r => isEntryDeleted(r))
      .sort((a, b) => b.raw.id - a.raw.id)

    if (list.length === 0) {
      inu.ui.toast('No deleted messages in this chat')
      return
    }

    inu.ui.openChatHistory({
      title: 'Deleted Messages',
      subtitle: `${list.length} messages`,
      icon: inu.icons.common('delete'),
      account: ctx.account.id,
      synthetic: true,
      avatars: ctx.dialogId < 0,
      loadAround: () => ({
        entries: list.slice(0, 200).map(r => ({
          key: `${ctx.dialogId}:${r.raw.id}`,
          message: cloneTl(r.raw),
        })),
        users: Object.values(store.users).map(u => cloneTl(u)),
        chats: Object.values(store.chats).map(c => cloneTl(c)),
      }),
      loadMore: () => ({ entries: [] }),
    })
  },
})
