import { describe, expect, it } from 'vitest'
import { aggregatePresence } from '../../src/lib/presence'

describe('presence aggregation', () => {
  it('is online while any valid session marker remains', () => {
    expect(aggregatePresence({ tabA: true, tabB: true })).toEqual({ online: true })
    expect(aggregatePresence({ tabA: false, tabB: true })).toEqual({ online: true })
  })

  it('returns only an online boolean and no last-seen information', () => {
    expect(aggregatePresence(null)).toEqual({ online: false })
    expect(aggregatePresence({ tabA: false, disconnectedAt: 123 })).toEqual({ online: false })
    expect(Object.keys(aggregatePresence({ tabA: true }))).toEqual(['online'])
  })
})
