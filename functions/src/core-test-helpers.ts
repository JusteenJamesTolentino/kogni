import type { CoreDatabase, CoreSnapshot, CoreReference } from './database-core.js'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function eligibleTestAccount(uid: string, privacyVersion = 'privacy-2026-11-10-ai-series-1') {
  return {
    uid, status: 'ready', nickname: `User_${uid}`.slice(0, 24), nicknameCanonical: `user_${uid}`.slice(0, 24),
    privacy: { currentVersion: privacyVersion, acknowledgements: { [privacyVersion]: 1 } },
    preferences: { discoverable: true, presence: true },
  }
}

export function memoryDatabase(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial)
  const reads: { path: string; limit?: number; after?: string }[] = []
  function read(path: string): unknown {
    return path.split('/').filter(Boolean).reduce<unknown>((value, key) => record(value)[key], data) ?? null
  }
  function write(path: string, value: unknown) {
    const keys = path.split('/').filter(Boolean)
    const final = keys.pop()
    if (!final) throw new Error('Test helper expects a child write')
    let parent = data
    for (const key of keys) {
      if (parent[key] === null || typeof parent[key] !== 'object') parent[key] = {}
      parent = record(parent[key])
    }
    if (value === null) delete parent[final]
    else parent[final] = structuredClone(value)
  }
  function snapshot(value: unknown, key: string | null): CoreSnapshot {
    return {
      key, val: () => structuredClone(value), exists: () => value !== null && value !== undefined,
      numChildren: () => Object.keys(record(value)).length,
      forEach(action) {
        for (const [childKey, child] of Object.entries(record(value))) if (action(snapshot(child, childKey)) === true) return true
        return false
      },
    }
  }
  function reference(path = '', options: { child?: string; equal?: string; after?: string; limit?: number; byKey?: boolean } = {}): CoreReference {
    return {
      async get() {
        reads.push({ path, limit: options.limit, after: options.after })
        let value = read(path)
        if (options.child !== undefined || options.byKey || options.limit !== undefined) {
          let entries = Object.entries(record(value)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
          if (options.child) entries = entries.filter(([, child]) => options.child!.split('/').reduce<unknown>((v, k) => record(v)[k], child) === options.equal)
          if (options.after !== undefined) entries = entries.filter(([key]) => key > options.after!)
          if (options.limit !== undefined) entries = entries.slice(0, options.limit)
          value = entries.length ? Object.fromEntries(entries) : null
        }
        return snapshot(value, path.split('/').pop() || null)
      },
      orderByChild(child) { return reference(path, { ...options, child }) },
      orderByKey() { return reference(path, { ...options, byKey: true }) },
      equalTo(equal) { return reference(path, { ...options, equal }) },
      startAfter(after) { return reference(path, { ...options, after }) },
      limitToFirst(limit) { return reference(path, { ...options, limit }) },
      async set(value) { write(path, value) },
      async remove() { write(path, null) },
      async update(values) { for (const [key, value] of Object.entries(values)) write([path, key].filter(Boolean).join('/'), value) },
      async transaction(update) {
        const value = update(read(path))
        if (value !== undefined) write(path, value)
        return { snapshot: snapshot(read(path), path.split('/').pop() || null), committed: value !== undefined }
      },
    }
  }
  const database: CoreDatabase = { ref: reference }
  return { database, data, reads, read, write }
}
