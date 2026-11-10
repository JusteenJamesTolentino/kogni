import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { createSocialCallableHandlers, followPlayerService, requireTargetUid } from './social.js'
import { eligibleTestAccount as account, memoryDatabase } from './core-test-helpers.js'
import type { Database } from 'firebase-admin/database'

const version = 'privacy-2026-11-10-ai-series-1'

function isCode(code: string) {
  return (error: unknown) => error instanceof HttpsError && error.code === code
}

test('legacy validation/service exports retain HttpsError compatibility', async () => {
  assert.throws(() => requireTargetUid({ uid: 'bad/path' }), isCode('invalid-argument'))
  const db = memoryDatabase({ accounts: { alice: account('alice'), bob: account('bob') } })
  await assert.rejects(() => followPlayerService(db.database, 'alice', 'alice', version), isCode('invalid-argument'))
  db.write('playerBlocks/bob/alice', 1)
  await assert.rejects(() => followPlayerService(db.database, 'alice', 'bob', version), isCode('not-found'))
})

test('callable adapter authenticates and validates before running shared service', async () => {
  const db = memoryDatabase({ accounts: { alice: account('alice'), bob: account('bob') } })
  const handlers = createSocialCallableHandlers(db.database as Database, () => version)
  await assert.rejects(() => handlers.followPlayer({ data: { uid: 'bob' } } as CallableRequest<unknown>), isCode('unauthenticated'))
  await assert.rejects(() => handlers.followPlayer({ auth: { uid: 'alice' }, data: null } as CallableRequest<unknown>), isCode('invalid-argument'))
  assert.equal(db.reads.length, 0)
  assert.deepEqual(await handlers.followPlayer({ auth: { uid: 'alice' }, data: { uid: 'bob' } } as CallableRequest<unknown>), { targetUid: 'bob', following: true })
})
