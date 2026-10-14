import { CAP_ROUND, DELETED_MAP, DoubleCls, FloatCls, JOIN_ROUND, LayoutCls, LIVE_CELLS, SRC_IN, SsbCls, STATE_MAP, StaticLayoutCls, STROKE, STYLED_CELLS, SystemCls, ThemeCls, TRASH_WIDTH_MAP } from './state.js'

const TrashSpan: any = inu.jvm.defineClass({
  superclass: inu.jvm.cls('android.text.style.ReplacementSpan'),
  methods: {
    getSize: {
      params: [
        'android.graphics.Paint',
        'java.lang.CharSequence',
        'int',
        'int',
        'android.graphics.Paint$FontMetricsInt',
      ],
      returns: 'int',
      body: inu.jvm.routine(function (paint, _t, _s, _e, _fm) {
        if (paint === null) return 18
        return DoubleCls.valueOf(paint.getTextSize() * 1.15 + 0.5).intValue()
      }),
    },
    draw: {
      params: [
        'android.graphics.Canvas',
        'java.lang.CharSequence',
        'int',
        'int',
        'float',
        'int',
        'int',
        'int',
        'android.graphics.Paint',
      ],
      returns: 'void',
      body: inu.jvm.routine(function (canvas, _t, _s, _e, x, _top, y, _bot, paint) {
        if (canvas === null || paint === null) return
        const s = paint.getTextSize()
        const dr = STATE_MAP.get('trashDrawable')
        if (dr !== null) {
          const sz = DoubleCls.valueOf(s * 1.12 + 0.5).intValue()
          const lx = DoubleCls.valueOf(x + s * 0.02).intValue()
          const ty = DoubleCls.valueOf(y + (paint.ascent() + paint.descent() - sz) * 0.5 + 0.5).intValue()
          dr.setBounds(lx, ty, lx + sz, ty + sz)
          dr.setColorFilter(paint.getColor(), SRC_IN)
          dr.draw(canvas)
          return
        }
        const oldStyle = paint.getStyle()
        const oldStroke = paint.getStrokeWidth()
        const oldCap = paint.getStrokeCap()
        const oldJoin = paint.getStrokeJoin()
        paint.setAntiAlias(true)
        paint.setStyle(STROKE)
        paint.setStrokeCap(CAP_ROUND)
        paint.setStrokeJoin(JOIN_ROUND)
        const sw = DoubleCls.valueOf(s * 0.095).floatValue()
        paint.setStrokeWidth(sw)
        canvas.drawLine(x + s * 0.12, y - s * 0.63, x + s * 0.86, y - s * 0.63, paint)
        canvas.drawLine(x + s * 0.35, y - s * 0.63, x + s * 0.35, y - s * 0.76, paint)
        canvas.drawLine(x + s * 0.35, y - s * 0.76, x + s * 0.63, y - s * 0.76, paint)
        canvas.drawLine(x + s * 0.63, y - s * 0.76, x + s * 0.63, y - s * 0.63, paint)
        canvas.drawLine(x + s * 0.20, y - s * 0.63, x + s * 0.24, y - s * 0.04, paint)
        canvas.drawLine(x + s * 0.78, y - s * 0.63, x + s * 0.74, y - s * 0.04, paint)
        canvas.drawLine(x + s * 0.24, y - s * 0.04, x + s * 0.74, y - s * 0.04, paint)
        canvas.drawLine(x + s * 0.40, y - s * 0.47, x + s * 0.40, y - s * 0.18, paint)
        canvas.drawLine(x + s * 0.58, y - s * 0.47, x + s * 0.58, y - s * 0.18, paint)
        paint.setStyle(oldStyle)
        paint.setStrokeWidth(oldStroke)
        paint.setStrokeCap(oldCap)
        paint.setStrokeJoin(oldJoin)
      }),
    },
  },
})

const onViewSetAlpha = inu.xposed.routine((ctx) => {
  try {
    const view = ctx.thisObject
    if (view === null) return
    if (STATE_MAP.get('seeDeleted') === false) return
    const hash = SystemCls.identityHashCode(view)
    if (STYLED_CELLS.containsKey(hash)) {
      if (ctx.args[0] > 0.56) {
        ctx.args[0] = DoubleCls.valueOf(0.55).floatValue()
      }
    }
  } catch {}
})

const onMeasureTime = inu.xposed.routine((ctx) => {
  try {
    const cell = ctx.thisObject
    const msg = ctx.args[0]
    if (cell === null || msg === null) return
    LIVE_CELLS.put(cell, true)

    const hash = SystemCls.identityHashCode(cell)
    if (STATE_MAP.get('seeDeleted') === false) {
      if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
      }
      return
    }

    const id = msg.getId()
    if (id <= 0 || msg.isOutOwner()) {
      if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
      }
      return
    }

    const dlg = msg.getDialogId()
    let tag = DELETED_MAP.get('' + dlg + ':' + id)
    if (tag === null) {
      const owner = msg.messageOwner
      const peer = owner !== null ? owner.peer_id : null
      if (peer !== null && ('' + peer.channel_id) === '0') {
        tag = DELETED_MAP.get('0:' + id)
      }
    }

    if (tag === null) {
      if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
      }
      return
    }

    STYLED_CELLS.put(hash, true)
    cell.setAlpha(DoubleCls.valueOf(0.55).floatValue())

    if (STATE_MAP.get('trashDrawable') === null) {
      try {
        const c = cell.getContext()
        if (c !== null) {
          const res = c.getResources()
          let resId = res.getIdentifier('msg_delete', 'drawable', c.getPackageName())
          if (resId === 0) {
            resId = res.getIdentifier('msg_delete', 'drawable', 'org.telegram.messenger')
          }
          if (resId !== 0) {
            const dr = c.getDrawable(resId)
            if (dr !== null) {
              STATE_MAP.put('trashDrawable', dr.mutate())
            }
          }
        }
      } catch {}
    }

    const cur = cell.currentTimeString
    if (cur === null || cur.toString().startsWith('\u200B')) return

    const beforeTrashW = cell.timeTextWidth
    const ssb = new SsbCls('\u200B\uFFFC ')
    ssb.setSpan(new TrashSpan(), 1, 2, 33)
    ssb.append(cur)
    cell.currentTimeString = ssb

    const layout = cell.timeLayout
    let paint = layout !== null ? layout.getPaint() : null
    if (paint === null && ThemeCls !== null) {
      try {
        paint = ThemeCls.chat_timePaint
      } catch {}
    }
    if (paint === null) {
      const fallbackDiff = 48
      cell.timeTextWidth = cell.timeTextWidth + fallbackDiff
      cell.timeWidth = cell.timeWidth + fallbackDiff
      TRASH_WIDTH_MAP.put(hash, fallbackDiff)
      return
    }

    const width = FloatCls.valueOf(LayoutCls.getDesiredWidth(ssb, paint) + 2.0).intValue()
    const diff = width - beforeTrashW
    if (diff > 0) {
      cell.timeTextWidth = width
      cell.timeWidth = cell.timeWidth + diff
      TRASH_WIDTH_MAP.put(hash, diff)
      if (layout !== null) {
        cell.timeLayout = new StaticLayoutCls(
          ssb,
          paint,
          width + 8,
          layout.getAlignment(),
          1.0,
          0.0,
          false,
        )
      }
    }
  } catch {}
})

const onCellMeasure = inu.xposed.routine((ctx) => {
  try {
    if (STATE_MAP.get('seeDeleted') === false) return
    const cell = ctx.thisObject
    if (cell === null) return
    const hash = SystemCls.identityHashCode(cell)
    const trashDiff = TRASH_WIDTH_MAP.get(hash)
    if (trashDiff === null || trashDiff <= 0) return

    const msg = cell.getMessageObject()
    if (msg === null || msg.isOutOwner()) return

    const newTimeW = cell.timeWidth
    const oldTimeW = newTimeW - trashDiff
    let txtW = 0
    try {
      txtW = msg.textWidth
    } catch {}

    const beforeMax = txtW > oldTimeW ? txtW : oldTimeW
    const afterMax = txtW > newTimeW ? txtW : newTimeW
    const alreadyWidened = afterMax - beforeMax
    let addW = trashDiff - alreadyWidened + 8
    if (addW < 8) addW = 8

    const maxBg = cell.getMeasuredWidth() - DoubleCls.valueOf(trashDiff * 1.4).intValue()
    if (maxBg > 0 && cell.backgroundWidth + addW > maxBg) {
      addW = maxBg - cell.backgroundWidth
    }
    if (addW > 0) {
      cell.backgroundWidth = cell.backgroundWidth + addW
      cell.timeX = cell.timeX + addW
    }
  } catch {}
})

const onBindCell = inu.xposed.routine((ctx) => {
  try {
    const cell = ctx.thisObject
    if (cell === null) return
    const msg = cell.getMessageObject()
    if (msg === null) return

    const hash = SystemCls.identityHashCode(cell)
    if (STATE_MAP.get('seeDeleted') === false) {
      if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
      }
      return
    }

    const id = msg.getId()
    if (id <= 0 || msg.isOutOwner()) {
      if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
      }
      const cur = cell.currentTimeString
      if (cur !== null && cur.toString().startsWith('\u200B')) {
        cell.currentTimeString = cur.subSequence(3, cur.length())
        cell.measureTime(msg)
      }
      return
    }

    const dlg = msg.getDialogId()
    let tag = DELETED_MAP.get('' + dlg + ':' + id)
    if (tag === null) {
      const owner = msg.messageOwner
      const peer = owner !== null ? owner.peer_id : null
      if (peer !== null && ('' + peer.channel_id) === '0') {
        tag = DELETED_MAP.get('0:' + id)
      }
    }

    if (tag === null) {
      if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
      }
      const cur = cell.currentTimeString
      if (cur !== null && cur.toString().startsWith('\u200B')) {
        cell.currentTimeString = cur.subSequence(3, cur.length())
        cell.measureTime(msg)
      }
      return
    }

    STYLED_CELLS.put(hash, true)
    cell.setAlpha(DoubleCls.valueOf(0.55).floatValue())
    const cur = cell.currentTimeString
    if (cur !== null && !cur.toString().startsWith('\u200B')) {
      const oldW = cell.timeWidth
      cell.measureTime(msg)
      const added = cell.timeWidth - oldW
      if (added > 0 && cell.backgroundWidth > 0) {
        cell.backgroundWidth = cell.backgroundWidth + added + 8
      }
      cell.requestLayout()
    }
  } catch {}
})

export const refreshCells = inu.jvm.routine(function () {
  try {
    const active = STATE_MAP.get('seeDeleted') !== false
    for (const cell of LIVE_CELLS.keySet()) {
      if (cell === null) continue
      const msg = cell.getMessageObject()
      if (msg === null) continue
      const id = msg.getId()
      const dlg = msg.getDialogId()
      let tag = null
      if (id > 0 && !msg.isOutOwner()) {
        tag = DELETED_MAP.get('' + dlg + ':' + id)
        if (tag === null) {
          const owner = msg.messageOwner
          const peer = owner !== null ? owner.peer_id : null
          if (peer !== null && ('' + peer.channel_id) === '0') {
            tag = DELETED_MAP.get('0:' + id)
          }
        }
      }
      const hash = SystemCls.identityHashCode(cell)
      if (active && tag !== null) {
        STYLED_CELLS.put(hash, true)
        cell.setAlpha(DoubleCls.valueOf(0.55).floatValue())
        const cur = cell.currentTimeString
        const hadTrash = cur !== null && cur.toString().startsWith('\u200B')
        const oldW = cell.timeWidth
        cell.measureTime(msg)
        if (!hadTrash) {
          const added = cell.timeWidth - oldW
          if (added > 0 && cell.backgroundWidth > 0) {
            cell.backgroundWidth = cell.backgroundWidth + added + 8
          }
          cell.requestLayout()
        }
        cell.invalidate()
      } else if (STYLED_CELLS.containsKey(hash)) {
        STYLED_CELLS.remove(hash)
        TRASH_WIDTH_MAP.remove(hash)
        cell.setAlpha(DoubleCls.valueOf(1.0).floatValue())
        const cur = cell.currentTimeString
        if (cur !== null && cur.toString().startsWith('\u200B')) {
          cell.currentTimeString = cur.subSequence(3, cur.length())
        }
        cell.measureTime(msg)
        cell.invalidate()
      }
    }
  } catch {}
})

try {
  const viewCls = inu.jvm.cls('android.view.View')
  inu.xposed.hookMethod(viewCls.getDeclaredMethod('setAlpha(F)V'), { before: onViewSetAlpha })
} catch {}

try {
  const msgCell = inu.jvm.cls('org.telegram.ui.Cells.ChatMessageCell')
  inu.xposed.hookAllOverloads(msgCell, 'measureTime', { after: onMeasureTime })
  inu.xposed.hookAllOverloads(msgCell, 'onMeasure', { after: onCellMeasure })
  inu.xposed.hookAllOverloads(msgCell, 'setMessageObject', { after: onBindCell })
  inu.xposed.hookAllOverloads(msgCell, 'onDraw', { before: onBindCell })
} catch {}

try {
  const actCell = inu.jvm.cls('org.telegram.ui.Cells.ChatActionCell')
  inu.xposed.hookAllOverloads(actCell, 'setMessageObject', { after: onBindCell })
} catch {}
