interface Config {
  editHistory: boolean
}

export interface CachedEntry {
  raw: tl.TypeMessage
  edits: tl.TypeMessage[]
  cachedAt: number
}

export interface DialogStore {
  accountId: number
  dialogId: number
  updatedAt: number
  messages: Record<number, CachedEntry>
  users: Record<number, tl.TypeUser>
  chats: Record<number, tl.TypeChat>
}

export interface IndexStore {
  lastCleanup: number
  dialogs: Record<string, number>
}

const CFG_KEY = 'inuedithistory_cfg_v1'
export const TTL_MS = 30 * 24 * 60 * 60 * 1000
export const CACHE_DIR = 'edit_cache_v1'
export const DLG_DIR = 'edit_cache_v1/dialogs'
export const IDX_FILE = 'edit_cache_v1/index.json'

function loadCfg(): Config {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (!raw) return { editHistory: true }
    const p = JSON.parse(raw)
    return {
      editHistory: typeof p.editHistory === 'boolean' ? p.editHistory : true,
    }
  } catch {
    return { editHistory: true }
  }
}

export const cfg: Config = loadCfg()

export function saveCfg(): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
  } catch {}
}
