import { defineString } from 'firebase-functions/params'

/** Non-secret deploy parameter. Firebase CLI prompts on deploy when no value is supplied. */
const privacyVersion = defineString('KOGNIT_PRIVACY_VERSION', {
  default: 'privacy-2026-11-10-ai-series-1',
  description: 'Current privacy acknowledgement version accepted by trusted projections',
})

export function expectedPrivacyVersion(): string {
  return privacyVersion.value()
}
