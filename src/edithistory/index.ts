import { cfg, saveCfg } from './config.js'
import { recordMessage } from './record.js'
import './store.js'
import './history.js'
import './viewer.js'

inu.onNewMessage((msg, acc) => {
  try {
    recordMessage(acc, msg)
  } catch {}
})

inu.onMessageEdited((msg, acc) => {
  try {
    recordMessage(acc, msg, { edit: true })
  } catch {}
})

inu.registerSettings(inu.ui.settingsPage({
  title: 'inuEditHistory',
  items: () => [
    inu.ui.header('Features'),
    inu.ui.check({
      id: 'edit-history',
      text: 'Edited Message History',
      icon: inu.icons.common('edit'),
      checked: cfg.editHistory,
      onChange: (val) => {
        cfg.editHistory = val
        saveCfg()
      },
    }),
  ],
}))
