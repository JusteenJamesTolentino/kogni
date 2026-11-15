// This public deployment parameter must match Functions and the current rules acknowledgement.
export function expectedPrivacyVersion(): string {
  return process.env.KOGNIT_PRIVACY_VERSION?.trim() || 'privacy-2026-11-15-school-quizzes-1'
}
