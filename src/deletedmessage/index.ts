import { refreshCells } from './cells.js'
import { cfg, saveCfg } from './config.js'
import { recordMessage } from './record.js'
import { uiHandler } from './state.js'
import './store.js'
import './deletions.js'
import './history.js'
import './viewer.js'

inu.onNewMessage((msg, acc) => {
  try {
    recordMessage(acc, msg)
  } catch {}
})

inu.onMessageEdited((msg, acc) => {
  try {
    recordMessage(acc, msg)
  } catch {}
})

inu.registerSettings(inu.ui.settingsPage({
  title: 'inuDeleted',
  items: () => [
    inu.ui.header('Features'),
    inu.ui.check({
      id: 'see-deleted',
      text: 'See Deleted Message',
      icon: inu.icons.common('delete'),
      checked: cfg.seeDeleted,
      onChange: (val) => {
        cfg.seeDeleted = val
        saveCfg()
        try {
          uiHandler.call('post', refreshCells)
        } catch {}
      },
    }),
  ],
}))
