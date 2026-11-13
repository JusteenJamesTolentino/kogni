import { describe, expect, it } from 'vitest'
import { buildAvatarKey, isOwnedAvatarKey, KOGNI_PREFIX } from '../../app/api/_lib/r2-keys'

const UID = 'QkvaWKUbDJafisrV9FhLm7Vm90I2'

describe('R2 avatar key helpers', () => {
  it('builds keys only under the kogni/ prefix with an image extension', () => {
    const key = buildAvatarKey(UID, 'image/png', 'a1b2c3d4e5f60718293a4b5c6d7e8f90')
    expect(key.startsWith(`${KOGNI_PREFIX}avatars/${UID}/`)).toBe(true)
    expect(key.endsWith('.png')).toBe(true)
    expect(buildAvatarKey(UID, 'image/jpeg')).not.toBe(buildAvatarKey(UID, 'image/jpeg'))
  })

  it('rejects unsupported content types and malformed owner ids', () => {
    expect(() => buildAvatarKey(UID, 'image/gif')).toThrow(TypeError)
    expect(() => buildAvatarKey(UID, 'image/svg+xml')).toThrow(TypeError)
    expect(() => buildAvatarKey('', 'image/png')).toThrow(TypeError)
    expect(() => buildAvatarKey('a/b', 'image/png')).toThrow(TypeError)
    expect(() => buildAvatarKey('.'.repeat(130), 'image/png')).toThrow(TypeError)
  })

  it('accepts only the owner\'s own avatar keys in the kogni scope', () => {
    const ownKey = buildAvatarKey(UID, 'image/webp', 'a1b2c3d4e5f60718293a4b5c6d7e8f90')
    expect(isOwnedAvatarKey(UID, ownKey)).toBe(true)

    // Another user's object, paths outside kogni/, traversal, and wrong file shapes.
    expect(isOwnedAvatarKey('other-user', ownKey)).toBe(false)
    expect(isOwnedAvatarKey(UID, 'other-folder/avatar.jpg')).toBe(false)
    expect(isOwnedAvatarKey(UID, `${KOGNI_PREFIX}avatars/${UID}/../secret.jpg`)).toBe(false)
    expect(isOwnedAvatarKey(UID, `${KOGNI_PREFIX}avatars/${UID}/short.jpg`)).toBe(false)
    expect(isOwnedAvatarKey(UID, `${KOGNI_PREFIX}avatars/${UID}/a1b2c3d4e5f60718293a4b5c6d7e8f90.txt`)).toBe(false)
    expect(isOwnedAvatarKey(UID, '')).toBe(false)
  })
})
