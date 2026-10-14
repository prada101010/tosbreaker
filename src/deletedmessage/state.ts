const MapCls = inu.jvm.cls('java.util.concurrent.ConcurrentHashMap')
const CollectionsCls = inu.jvm.cls('java.util.Collections')
const WeakMapCls = inu.jvm.cls('java.util.WeakHashMap')
export const SystemCls: any = inu.jvm.cls('java.lang.System')
export const FloatCls: any = inu.jvm.cls('java.lang.Float')
export const DoubleCls: any = inu.jvm.cls('java.lang.Double')
const StyleCls = inu.jvm.cls('android.graphics.Paint$Style')
const CapCls = inu.jvm.cls('android.graphics.Paint$Cap')
const JoinCls = inu.jvm.cls('android.graphics.Paint$Join')
export const STROKE: any = StyleCls.getStaticField('STROKE')
export const CAP_ROUND: any = CapCls.getStaticField('ROUND')
export const JOIN_ROUND: any = JoinCls.getStaticField('ROUND')
const ModeCls = inu.jvm.cls('android.graphics.PorterDuff$Mode')
export const SRC_IN: any = ModeCls.getStaticField('SRC_IN')
export const LayoutCls: any = inu.jvm.cls('android.text.Layout')
export const StaticLayoutCls: any = inu.jvm.cls('android.text.StaticLayout')
export const SsbCls: any = inu.jvm.cls('android.text.SpannableStringBuilder')
const HandlerCls = inu.jvm.cls('android.os.Handler')
const LooperCls = inu.jvm.cls('android.os.Looper')
export const ThemeCls: any = (function () { try { return inu.jvm.cls('org.telegram.ui.ActionBar.Theme') } catch { return null } })()

export const uiHandler = new HandlerCls(LooperCls.callStatic('getMainLooper'))
export const DELETED_MAP: any = new MapCls()
export const OWN_DELETE_MAP: any = new MapCls()
export const STYLED_CELLS: any = new MapCls()
export const TRASH_WIDTH_MAP: any = new MapCls()
export const STATE_MAP: any = new MapCls()
export const LIVE_CELLS: any = CollectionsCls.callStatic('synchronizedMap', new WeakMapCls())

function initTelegramConsts(): void {
  try {
    const ncCls = inu.jvm.cls('org.telegram.messenger.NotificationCenter')
    const delId = ncCls.getStaticField('messagesDeleted')
    if (typeof delId === 'number') {
      STATE_MAP.call('put', 'msgDeletedId', delId)
    }
  } catch {}
  try {
    const appCls = inu.jvm.cls('org.telegram.messenger.ApplicationLoader')
    const ctx = appCls.getStaticField('applicationContext')
    if (ctx !== null) {
      const res = ctx.call('getResources')
      const pkg = ctx.call('getPackageName')
      for (const name of ['msg_delete', 'chats_delete', 'ic_delete']) {
        let id = res.call('getIdentifier', name, 'drawable', pkg)
        if (id === 0) id = res.call('getIdentifier', name, 'drawable', 'org.telegram.messenger')
        if (id !== 0) {
          const dr = ctx.call('getDrawable', id)
          if (dr !== null) {
            STATE_MAP.call('put', 'trashDrawable', dr.call('mutate'))
            return
          }
        }
      }
    }
  } catch {}
}

initTelegramConsts()

export function isCommonBoxDialog(dlgId: number | null): boolean {
  return dlgId === null || dlgId > -1000000000000
}

export function markJavaDeleted(dlgId: number | null, simpleId: number | null, msgId: number, commonBox: boolean): void {
  if (msgId <= 0) return
  if (simpleId !== null && simpleId !== 0) DELETED_MAP.call('put', `${simpleId}:${msgId}`, '1')
  if (dlgId !== null && dlgId !== 0) {
    DELETED_MAP.call('put', `${dlgId}:${msgId}`, '1')
    DELETED_MAP.call('put', `${inu.utils.peers.toSimpleDialogId(dlgId)}:${msgId}`, '1')
  }
  if (commonBox) DELETED_MAP.call('put', `0:${msgId}`, '1')
}
