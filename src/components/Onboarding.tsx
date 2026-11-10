import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, ShieldCheck, UserRound } from 'lucide-react'
import { PRIVACY_VERSION } from '../lib/account'

export interface OnboardingSubmission {
  nickname: string
  acknowledgedPrivacyVersion: string
  discoverable: boolean
  presence: boolean
}

interface OnboardingProps {
  saving?: boolean
  error?: string
  initialNickname?: string
  onSubmit: (submission: OnboardingSubmission) => void | Promise<void>
}

export default function Onboarding({ saving = false, error = '', initialNickname = '', onSubmit }: OnboardingProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [nickname, setNickname] = useState(initialNickname)
  const [acknowledged, setAcknowledged] = useState(false)
  const [discoverable, setDiscoverable] = useState(false)
  const [presence, setPresence] = useState(false)
  const validNickname = /^[A-Za-z0-9_]{3,24}$/.test(nickname)

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-4 py-10 sm:px-6">
      <section className="card w-full border border-base-300 bg-base-100 shadow-2xl" aria-labelledby="onboarding-title">
        <div className="card-body p-6 sm:p-10">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck size={25} aria-hidden="true" /></div>
            <div>
              <div className="badge badge-primary badge-outline">First-time account setup</div>
              <h1 id="onboarding-title" className="mt-3 text-3xl font-black tracking-tight">Privacy and learner identity</h1>
              <p className="mt-2 text-base-content/60">Choose the nickname Kogni will use and acknowledge how account, public-feature, online, and local study data are handled.</p>
            </div>
          </div>

          {error && <div role="alert" className="alert alert-error mt-6"><span>{error}</span></div>}

          <label className="form-control mt-7 w-full">
            <span className="label-text mb-2 font-semibold">Unique Kogni nickname</span>
            <label className="input input-bordered flex items-center gap-2 focus-within:input-primary">
              <UserRound size={17} className="text-base-content/45" aria-hidden="true" />
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="grow" placeholder="study_learner" autoComplete="nickname" maxLength={24} disabled={saving} />
            </label>
            <span className={`mt-2 text-xs ${nickname && !validNickname ? 'text-error' : 'text-base-content/55'}`}>3–24 letters, digits, or underscores. Nicknames are unique without regard to case.</span>
          </label>

          <div className="mt-6 rounded-2xl border border-base-300 bg-base-200/40 p-4 text-sm leading-relaxed text-base-content/70">
            <p>Decks explicitly saved offline, card schedules, and answer history are stored in this browser. Online decks, cloud progress, acknowledgements, public-feature identity, sharing, portals, leaderboards, and optional presence use Firebase.</p>
            <p className="mt-2">Public data is shown only through the feature you enable or use. Email is not copied into public profiles. Gemini is optional; creating or regenerating AI decks requires your own Google AI Studio key/project quota, which may incur charges. Existing and shared decks remain key-free.</p>
            <Link to="/privacy" state={{ from: `${location.pathname}${location.search}` }} className="link link-primary mt-3 inline-block font-semibold">Read the full Privacy Notice ({PRIVACY_VERSION})</Link>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <input type="checkbox" className="checkbox checkbox-primary mt-0.5" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={saving} />
            <span><span className="font-semibold">I have read and understand the Privacy Notice.</span><span className="mt-1 block text-xs text-base-content/55">This records the exact notice version and server timestamp. It does not waive your privacy rights.</span></span>
          </label>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-base-300 p-4">
            <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} disabled={saving} />
            <span><span className="font-semibold">Let signed-in learners find me by nickname</span><span className="mt-1 block text-xs text-base-content/55">Publishes only the nickname projection required for Community search.</span></span>
          </label>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-base-300 p-4">
            <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={presence} onChange={(event) => setPresence(event.target.checked)} disabled={saving} />
            <span><span className="font-semibold">Show Online or Offline status</span><span className="mt-1 block text-xs text-base-content/55">Opt-in only. Exact last-seen time, device details, and activity are not public.</span></span>
          </label>

          <div className="card-actions mt-7 justify-end">
            <button
              type="button"
              className="btn btn-primary min-w-48 gap-2"
              disabled={!validNickname || !acknowledged || saving}
              onClick={() => void onSubmit({
                nickname,
                acknowledgedPrivacyVersion: PRIVACY_VERSION,
                discoverable,
                presence,
              })}
            >
              {saving ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
              Create Kogni profile
            </button>
          </div>
          <button type="button" onClick={() => navigate('/sign-in', { replace: true })} className="btn btn-ghost btn-sm mt-2 self-center" disabled={saving}>Use another account</button>
        </div>
      </section>
    </main>
  )
}
