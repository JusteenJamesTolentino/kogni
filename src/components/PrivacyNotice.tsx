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
          <div><div className="badge badge-primary badge-outline">Version {PRIVACY_VERSION}</div><h1 className="mt-3 text-3xl font-black">Kognit Privacy Notice</h1><p className="mt-2 text-base-content/60">A product disclosure of how this implementation handles account, study, sharing, and presence data.</p></div>
        </div>
        <div className="prose mt-8 max-w-none text-base-content/75 dark:prose-invert">
          <p><strong>This product disclosure is not legal advice.</strong> Deployment-specific compliance, retention periods, lawful bases, age requirements, and international transfers should be reviewed by qualified privacy counsel.</p>
          <h2>Private account data</h2><p>Kognit stores your Firebase user ID, unique nickname, acknowledgement version and timestamps, and discoverability/presence preferences in a private Firebase account record. Email is not copied into public profile records.</p>
          <h2>Browser-local offline study data</h2><p>Decks explicitly saved offline, cards, schedules, and answer history are stored in this browser’s IndexedDB. They remain after sign-out until deleted or site data is cleared, and normal app access is scoped to the same signed-in Firebase UID.</p>
          <h2>Online and public-feature data</h2><p>Online decks, cloud-synced personal progress, shares, portals, leaderboards, and privacy acknowledgement metadata use Firebase. Your nickname is shown only through public/community features you enable or use, such as search discoverability, leaderboard participation, decks you share, and portal previews.</p>
          <h2>Presence</h2><p>Online/Offline presence is optional and hidden by default. When enabled, Kognit exposes only a coarse online boolean to eligible signed-in learners—not exact last-seen time, IP address, device, or user agent. Presence is advisory and can briefly be stale.</p>
          <h2>Google, Firebase, and optional Gemini BYOK</h2><p>Google/Firebase provide authentication and data infrastructure. Firebase authentication may persist a browser session. Kognit provides no shared Gemini key: AI import, regeneration, and creator continuations require the user or creator’s own Google AI Studio key, model access, project quota, and possible charges. Explicit settings verification sends only a key-authenticated model metadata request; it generates no content and uploads no source. Generation sends the selected source file or disclosed published continuation context. Saved keys remain browser-readable localStorage values and are never stored in Firebase or included in decks, shares, portals, logs, analytics, or URLs. Deck recipients and players never use the creator’s key or quota.</p>
          <h2>AI-generated deck series</h2><p>Creators may explicitly send a published series topic, study guide, and prior series questions to Gemini using the creator’s locally configured key and quota to generate a reviewed continuation. Players do not trigger Gemini generation or AI charges by finishing a part, and player ratings or private schedules are not sent for continuation generation.</p>
          <h2>Public player profiles and following</h2><p>Discoverable profiles may show your canonical nickname, Community XP labeled client-reported, aggregate follower/following counts, published-deck count, and coarse Online/Offline status. They do not show email, private acknowledgement data, local/offline decks, schedules, review history, follower identities, exact last-seen time, devices, IP address, or user agent. Following is immediate but grants no deck or presence access. Blocking is private and removes follows in both directions.</p>
          <h2>Online versus offline decks</h2><p>Creators control mutable versioned online decks. An offline save is an independent, frozen browser snapshot limited by the creator’s maximum and your selected question count. Later creator changes or revocation cannot retract an offline copy already saved.</p>
          <h2>Your controls</h2><p>You can change nickname, discoverability, and presence from Profile. Disabling discoverability removes the searchable projection; disabling presence removes active presence sessions. Historical immutable shares or portal snapshots may retain the nickname present when they were created.</p>
        </div>
      </article>
    </main>
  )
}
