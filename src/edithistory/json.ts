const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodeJson(val: unknown): Uint8Array {
  return enc.encode(JSON.stringify(val, (_k, v) => {
    if (v instanceof Uint8Array) return { __u8: inu.utils.toBase64(v) }
    if (typeof v === 'bigint') return { __bi: v.toString() }
    return v
  }))
}

export function decodeJson<T>(buf: Uint8Array): T {
  return JSON.parse(dec.decode(buf), (_k, v) => {
    if (v !== null && typeof v === 'object') {
      if (typeof v.__u8 === 'string') return inu.utils.fromBase64(v.__u8)
      if (typeof v.__bi === 'string') return BigInt(v.__bi)
    }
    return v
  }) as T
}

export function cloneTl<T>(v: T): T {
  try {
    return structuredClone(v)
  } catch {
    return decodeJson<T>(encodeJson(v))
  }
}
