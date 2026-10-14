import { STATE_MAP } from './state.js'

interface Config {
  seeDeleted: boolean
}

export interface CachedEntry {
  raw: tl.TypeMessage
  cachedAt: number
  deletedAt: number | null
  mediaPath: string | null
}

export interface DialogStore {
  accountId: number
  dialogId: number
  simpleId: number
  updatedAt: number
  messages: Record<number, CachedEntry>
  users: Record<number, tl.TypeUser>
  chats: Record<number, tl.TypeChat>
}

export interface IndexStore {
  lastCleanup: number
  msgToDialog: Record<string, number>
  deleted: Record<string, { accountId: number, dialogId: number, simpleId: number, msgId: number, deletedAt: number }>
  dialogs: Record<string, number>
}

const CFG_KEY = 'inudeleted_cfg_v1'
export const TTL_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024
export const CACHE_DIR = 'deleted_cache_v1'
export const DLG_DIR = 'deleted_cache_v1/dialogs'
export const MEDIA_DIR = 'deleted_cache_v1/media'
export const IDX_FILE = 'deleted_cache_v1/index.json'

function loadCfg(): Config {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (!raw) return { seeDeleted: true }
    const p = JSON.parse(raw)
    return {
      seeDeleted: typeof p.seeDeleted === 'boolean' ? p.seeDeleted : true,
    }
  } catch {
    return { seeDeleted: true }
  }
}

export const cfg: Config = loadCfg()

export function isEntryDeleted(rec: CachedEntry | undefined | null): boolean {
  return Boolean(rec && typeof rec.deletedAt === 'number' && rec.deletedAt > 0)
}

function syncState(): void {
  try {
    STATE_MAP.call('put', 'seeDeleted', Boolean(cfg.seeDeleted))
  } catch {}
}

syncState()

export function saveCfg(): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
    syncState()
  } catch {}
}
