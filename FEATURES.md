# tosbreaker plugins

> one section per plugin in this repo, in `inu.config.ts` order.
> keep this updated as plugins/features are added/removed.

every plugin is installed on its own, everything inside is toggleable in its settings, defaults are
"break the tos".

## `noads`

- hide sponsored messages in channels, bot chats and the video player (`messages.getSponsoredMessages` answers empty, the request never leaves the device)
- hide sponsored results in search (`contacts.getSponsoredPeers`)
- hide the proxy sponsored channel pinned in the chat list while using an MTProxy; psa announcements are left alone, pending suggestions from the same response are lost
## `nostatuses`

- hide online status, aka ghost mode (`account.updateStatus`); forces the two below on
- hide read receipts (`messages.readHistory`, `channels.readHistory` and `readMessageContents` answer locally)
- hide typing status (`messages.setTyping`, `messages.setEncryptedTyping`)

## `onetimeallower`

needs `unsafe.jvm` + `unsafe.xposed`: `FLAG_SECURE`, the message menu and screenshot detection all
live in app ui code, no public plugin api reaches them.

- screenshots of one-time media: `FLAG_SECURE` is stripped only from the `SecretMediaViewer` window (photos, videos) and the `SecretVoicePlayer` dialog (voice and round "once")
- "save to gallery" in the message menu for one-time media: `needDrawBluredPreview`/`isVoiceOnce`/`isRoundOnce` answer false only while `ChatActivity.createMenu` runs. photos are already on disk, videos have to be loaded first; view-once disappears after viewing, so save before opening
- no screenshot notifications: `MediaController.checkScreenshots` is skipped, so neither `messages.sendScreenshotNotification` nor the secret chat screenshot action is sent

## `screenallower`

needs `unsafe.jvm` + `unsafe.xposed`: same as `onetimeallower`, plus `noforwards` is enforced in
app ui code, and stripping it from api responses would mean rewriting every method returning chats
or messages.

- screenshots everywhere: `FLAG_SECURE` is stripped in `Window.setFlags`/`setAttributes` and `WindowManagerImpl.addView`/`updateViewLayout` (protected and secret chats, PhotoViewer, one-time media, stories, passcode screen, everything)
- ignore "restrict saving content": `MessagesController.isChatNoForwards`/`isUserNoForwards` answer false, `message.noforwards` is cleared when a `MessageObject` is built. copy/save/share open up; server-side forwarding is still refused
- no screenshot notifications, same as in `onetimeallower`

## `deletedmessage`

needs `unsafe.jvm` + `unsafe.xposed`: the delete notifications are dropped before the app applies
them, and marking the kept bubble is a drawing-time change in app ui code, no public plugin api
reaches either.

- keep deleted messages: `updateDeleteMessages`/`updateDeleteChannelMessages` answer as dropped,
  together with the same updates inside `updates.getDifference`/`updates.getChannelDifference` while
  catching up. ids and raw messages go to the plugin's private directory for 30 days and the app
  leaves the bubble on screen
- the user's own deletes still go through: `messages.deleteMessages`/`channels.deleteMessages` and
  `MessagesController.deleteMessages` mark them first, so those are delivered untouched
- the app's own delete notification is swallowed too (`postNotificationNameInternal`,
  `ChatActivity.didReceivedNotification` and `MessagesStorage.markMessagesAsDeleted`), which is what
  keeps the bubble from disappearing
- reloads: kept messages are merged back into `messages.getHistory`, and `messageEmpty` slots in
  `messages.getMessages`/`channels.getMessages` are replaced, so they reappear after a restart.
  downloaded media (up to 15 MB per message) is restored with them, `ttl_seconds` stripped
- dimming: `ChatMessageCell.measureTime`/`onMeasure`/`onDraw`/`setMessageObject` run compiled
  routines that read the kept ids from a java `HashSet`, fade the bubble to 55% and draw a trash
  glyph after it. `View.setAlpha`/`setMessageObject` reset a recycled cell from its current message
  so the dimming never leaks. a "Deleted Messages" chat action lists them in a synthetic page
- settings: "See Deleted Message", on by default, flips a captured java flag, so it is instant and a
  dimmed bubble resets on its next draw

## `edithistory`

no unsafe grants: the whole feature is public plugin api (`onUpdate`, `interceptRpc`,
`registerMessageAction`, `openChatHistory` and `fs`).

- edit history: snapshots every message (`onNewMessage`, plus `messages.getHistory` when a dialog is
  open) and, on `onMessageEdited`, keeps the previous version before refreshing it. the comparison is
  text only, so formatting-only edits (entity changes) do not count
- "edit history" in the message menu opens the stored versions in a synthetic chat page, newest
  first. at most 30 versions per message, all expiring after 30 days
