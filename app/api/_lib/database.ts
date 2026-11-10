import type { CoreDatabase } from '../../../functions/src/database-core'

export const SERVICE_UNAVAILABLE_MESSAGE = 'Player service is unavailable.'
export const DATABASE_TIMEOUT_MS = 8000

export class ServiceUnavailableError extends Error {
  constructor() {
    super(SERVICE_UNAVAILABLE_MESSAGE)
    this.name = 'ServiceUnavailableError'
  }
}

export async function withTimeout<T>(operation: () => Promise<T>, timeoutMs = DATABASE_TIMEOUT_MS): Promise<T> {
  if (timeoutMs <= 0) throw new ServiceUnavailableError()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ServiceUnavailableError()), timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** A shared request deadline also prevents new DB work after an earlier operation times out. */
export function databaseWithDeadline<T extends CoreDatabase>(database: T, timeoutMs = DATABASE_TIMEOUT_MS): CoreDatabase {
  const deadline = Date.now() + timeoutMs
  const operations = new Set(['get', 'set', 'remove', 'update', 'transaction'])
  function wrap(target: object): object {
    return new Proxy(target, {
      get(object, property) {
        const value: unknown = Reflect.get(object, property)
        if (typeof value !== 'function') return value
        if (operations.has(String(property))) {
          return (...args: unknown[]) => withTimeout(() => Reflect.apply(value, object, args) as Promise<unknown>, deadline - Date.now())
        }
        return (...args: unknown[]) => {
          if (Date.now() >= deadline) throw new ServiceUnavailableError()
          const result: unknown = Reflect.apply(value, object, args)
          return result !== null && typeof result === 'object' ? wrap(result) : result
        }
      },
    })
  }
  return { ref: (path?: string) => wrap(database.ref(path)) as ReturnType<CoreDatabase['ref']> }
}
