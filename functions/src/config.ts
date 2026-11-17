import { defineString } from 'firebase-functions/params'

export const DEFAULT_PRIVACY_VERSION = 'privacy-2026-11-17-quiz-integrity-1'

/** Non-secret deploy parameter. Firebase CLI prompts on deploy when no value is supplied. */
const privacyVersion = defineString('KOGNIT_PRIVACY_VERSION', {
  default: DEFAULT_PRIVACY_VERSION,
  description: 'Current privacy acknowledgement version accepted by trusted projections',
})

export function expectedPrivacyVersion(): string {
  return privacyVersion.value()
}
