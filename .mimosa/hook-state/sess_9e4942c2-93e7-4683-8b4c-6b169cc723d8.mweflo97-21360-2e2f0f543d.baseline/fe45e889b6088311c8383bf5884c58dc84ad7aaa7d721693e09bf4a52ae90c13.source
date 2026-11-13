import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { PRIVACY_VERSION } from '../lib/account'

export default function PrivacyNotice() {
  const location = useLocation()
  const state = location.state as { from?: string } | null
  const backTo = state?.from?.startsWith('/') ? state.from : '/sign-in'

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to={backTo} className="btn btn-ghost btn-sm -ml-2 gap-2"><ArrowLeft size={16} aria-hidden="true" />Back</Link>
      <article className="mt-4 rounded-3xl border border-base-300 bg-base-100 p-6 shadow-xl sm:p-10">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck size={25} aria-hidden="true" /></div>
          <div><div className="badge badge-primary badge-outline">Version {PRIVACY_VERSION}</div><h1 className="mt-3 text-3xl font-black">Kogni Privacy Notice</h1><p className="mt-2 text-base-content/60">A product disclosure of how this implementation handles account, study, sharing, and presence data.</p></div>
        </div>
        <div className="prose mt-8 max-w-none text-base-content/75 dark:prose-invert">
          <p><strong>This product disclosure is not legal advice.</strong> Deployment-specific compliance, retention periods, lawful bases, age requirements, and international transfers should be reviewed by qualified privacy counsel.</p>
          <h2>Private account data</h2><p>Kogni stores your Firebase user ID, unique nickname, privacy acknowledgement version and timestamps, and discoverability/presence preferences in a private Firebase account record. Your authentication email is not copied into public profile records.</p>
          <h2>Online decks and schedules</h2><p>Normal new, manual, AI-generated, shared, and portal decks—and their review schedules—are stored in Firebase for your signed-in account and require an internet connection. New decks are private by default. They become public only after the owner explicitly confirms publication.</p>
          <h2>Legacy decks on this device</h2><p>Existing IndexedDB decks are not automatically uploaded, changed, or deleted. They appear only in the read-only Legacy decks recovery screen. After you preview and confirm a deck, Kogni creates a private cloud copy with a fresh schedule; the device original and its schedule remain unchanged.</p>
          <h2>Browser-local settings</h2><p>Your theme and sidebar preference remain local to this browser. The Gemini key and model are also browser-local, but Kogni removes them on sign-out. The key is stored in localStorage, is not synchronized through Firebase, and may be readable by same-origin scripts, extensions, shared browser profiles, or people with device access. Legacy device decks remain after sign-out.</p>
          <h2>Uploaded sources and optional Gemini BYOK</h2><p>Kogni provides no shared Gemini key. AI generation uses your own Google AI Studio key, model access, quota, and possible charges. Generation sends the source you select from this browser to Gemini for that request; Kogni does not retain the uploaded source, so regeneration requires selecting it again. Your key is never stored in Firebase or included in decks, shares, portals, logs, analytics, or URLs. Recipients never use the creator’s key or quota.</p>
          <h2>Sharing, public profiles, and presence</h2><p>Sharing and portals expose deck content only through access the owner intentionally grants. Discoverable profiles may show your nickname, client-reported Community XP, aggregate follow counts, published-deck count, and optional coarse Online/Offline status. They do not show email, private decks, schedules, review history, follower identities, exact last-seen time, devices, IP address, or user agent. Discoverability and presence are separate opt-ins that default off.</p>
          <h2>Deletion and your controls</h2><p>You can change nickname, discoverability, and presence; keep decks private or explicitly publish them; recover a legacy deck as a private copy; and delete an online deck. Online deletion creates a terminal private tombstone that ends active access, but it is not a promise of immediate physical erasure from every retained version, schedule record, audit record, or backup. Clearing site data removes browser-local settings and legacy decks, not account-backed decks or schedules.</p>
        </div>
      </article>
    </main>
  )
}
