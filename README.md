# Kogni

## Overview

Kogni is a local-first study application for creating AI-assisted flashcard decks, sharing independent copies with discoverable learners, and reviewing with spaced repetition. Decks and review schedules stay in the browser; Firebase provides Google sign-in, opt-in user discovery, shared deck snapshots, and global/deck leaderboards. Gemini API key and model settings are optional and are only needed when a learner chooses Magic Import.

## Features

- Generate study decks from PDF, JPEG, PNG, or WebP files up to 14 MiB.
- Configure the Gemini API key and exact model ID used for import.
- Produce structured decks of up to 50 cards plus a source-grounded study guide.
- Read the guide before Practice questions to build context without changing schedules or XP.
- Read topic summaries on deck pages; questions and answers appear only inside practice or scheduled review sessions.
- Keep owned decks, copied decks, cards, and review progress locally in IndexedDB.
- Opt into learner search without exposing an email address.
- Share content-only deck snapshots that recipients save as independent local copies.
- View real-time global and per-deck community leaderboards.
- Use responsive light and dark interfaces with keyboard study controls.

## Architecture & Data Flow

Kogni runs a Next.js application on Vercel with a React client-side router. Firebase Authentication and Realtime Database remain the identity and storage services.

```text
Browser → Firebase Auth → bearer ID token → Next.js /api → Firebase Admin → RTDB
Browser → owner-private presenceSessions → Firebase onDisconnect removal
Next.js online discovery → session candidates + eligible accounts → minimal player results
Next.js follow/unfollow → canonical playerFollowEdges → synchronous derived lists/profiles
```

Presence, profile lookup, and follow/unfollow do not require Firebase Cloud Functions. Presence API polling reflects opaque per-tab markers; closing one tab does not remove another tab's session. Public online results require current privacy acknowledgement and both discoverability and presence opt-ins. The API never returns session IDs, email addresses, acknowledgement history, or last-seen timestamps.

| Concern | Implementation |
| --- | --- |
| UI | React, Tailwind CSS, and daisyUI |
| Decks and review progress | Browser IndexedDB (`FlashcardAppDB`) |
| Public profiles, shared snapshots, and leaderboards | Firebase Realtime Database |
| Preferences and client metadata | Browser `localStorage` |
| Authentication | Firebase Authentication with Google |
| AI import | Direct browser requests through `@google/genai` |
| Hosting | Next.js on Vercel; `.next/` production build and Node.js API functions |

This design is **local-first, not account-synchronized**. Owned decks, copied decks, schedules, and answer history remain scoped to the current browser profile and origin. Firebase stores only an opted-in public profile, content-only snapshots explicitly shared with selected recipients, inbox/access metadata, review-event markers, and aggregate leaderboard records. Saving a shared snapshot creates a new independent local deck with reset scheduling; later source edits do not synchronize. Clearing site data, changing browsers, or changing deployment domains can make local study data unavailable.

## Setup & Dependencies

Key packages: Next.js, React, Firebase client SDK, Firebase Admin SDK, `idb`, Tailwind CSS/daisyUI, and optional `@google/genai`. Vitest, Firebase rules-unit-testing, Oxlint, and TypeScript support verification. Java is required for database emulator tests.

- Node.js `20.19+` or `22.12+`
- npm
- A Firebase project, such as `kogni-ai`, with permission to configure Authentication and Realtime Database
- A Google AI Studio Gemini API key, only when using Magic Import
- [Firebase CLI](https://firebase.google.com/docs/cli) when deploying database rules

## Usage & API Reference

### Install and run

```bash
npm ci
```

Never overwrite an existing local environment file. If `.env.local` does not exist, create it from the committed template:

```bash
# macOS/Linux
cp .env.example .env.local

# Windows Command Prompt
copy .env.example .env.local
```

Populate `.env.local`, then start the development server:

```bash
npm run dev
```

`VITE_FIREBASE_*` public settings remain supported during migration, but prefer the `NEXT_PUBLIC_FIREBASE_*` names in `.env.example`. Never overwrite an existing `.env.local` when copying the template. Next.js prints the local URL, normally `http://localhost:3000`.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:rules` | Start the Realtime Database emulator and run authorization tests. |
| `npm run lint` | Lint `src/` and `app/` with Oxlint. |
| `npm run typecheck` | Check browser and Next.js API TypeScript. |
| `npm run build` | Create a production Next.js build in `.next/`. |
| `npm run preview` | Serve the production build locally for verification. |

A typical pre-deployment check is:

```bash
npm run lint
npm run test
npm run test:rules
npm run build
npm run preview
```

### Player API

All player APIs require `Authorization: Bearer <Firebase ID token>` and a ready account with the current privacy acknowledgement. Tokens and service-account credentials must not be logged or committed.

| Method and path | Contract |
| --- | --- |
| `GET /api/players/online` | `{ items: [{ uid, nickname, nicknameCanonical }], hasMore }`, at most 20 eligible online players. |
| `GET /api/players/:uid` | `{ profile, social: { following, followedBy } }`; profile XP is explicitly `client-reported`. |
| `GET /api/players/me/social-summary` | Owner-only `{ followerCount, followingCount }`; follower identities are not returned. |
| `GET /api/players/:uid/decks` | A bounded page of that eligible player’s active public published-deck metadata; local/imported deck contents are never returned. Uses an opaque cursor; owners exceeding the bounded 500-record scan fail closed rather than returning misleading pagination. |
| `GET /api/players/:uid/presence` | `{ online: boolean }`, without session IDs or last-seen data. |
| `POST /api/social/follow` | JSON `{ "uid": "target-user-id" }`; returns `{ targetUid, following: true }`. |
| `POST /api/social/unfollow` | JSON `{ "uid": "target-user-id" }`; returns `{ targetUid, following: false }`. |

The browser request helper obtains a token from the current Firebase session. For manual API testing, use a valid token from an authorized test session and do not paste it into source control:

```bash
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" http://localhost:3000/api/players/online
curl -X POST -H "Authorization: Bearer $FIREBASE_ID_TOKEN" -H "Content-Type: application/json" --data '{"uid":"target-user-id"}' http://localhost:3000/api/social/follow
```

## Error Handling & Edge Cases

- Missing/malformed Firebase Admin configuration returns a sanitized service-unavailable response. Check the four server-only settings and that client/server Firebase project IDs match; a browser API key is not an Admin credential.
- Missing/invalid/expired ID tokens return 401; malformed JSON, invalid Firebase keys, and self-follow requests return 400. Private or blocked targets are not disclosed.
- Presence writes affect only the authenticated user's opaque tab markers. Firebase removes disconnected markers, and the user remains online while another tab survives. Preference opt-outs hide presence immediately when the next API read validates the account.
- Player requests have finite timeout boundaries. Network failures do not fall back to untrusted client writes or stale `activePlayers` projections.
- Follow/unfollow use canonical edges and reconcile derived data synchronously. Repeating a successful operation does not duplicate the edge or inflate counts. Your profile receives only owner-scoped follower/following totals; follower identity lists are not exposed.
- Visited profiles list only active public online decks that the owner intentionally published. Imported, copied, AI-generated, and manually created decks stored only in another learner’s browser remain private. Published-deck pagination uses an opaque cursor and rechecks privacy and blocks at the response boundary.
- Malformed legacy leaderboard identities and online deck versions are rejected before rendering; Firebase child identity must match embedded IDs, card order mappings must be exact, and the UI does not replace stable domain IDs with array-index React keys.
- Without deployed Firebase triggers, account opt-outs are checked on reads/writes; legacy stored projections and edges may remain until service reconciliation. They are not treated as authorization or online-state sources. No scheduled retention cleanup is configured by this change.
- Offline local study remains browser-scoped. Online social functions still require a connection; optional legacy catalog projection features are separate from these Vercel fixes.

Run authorization tests only against the demo emulator:

```bash
firebase emulators:exec --only database --config firebase.test.json --project demo-kognit-rules "npx vitest run test/lib/database.rules.test.ts"
```

## Firebase setup

The repository is configured to deploy Realtime Database rules from `database.rules.json`. The steps below use `kogni-ai` as an example project ID; substitute your own project where appropriate.

### 1. Register a web app

1. Open the [Firebase console](https://console.firebase.google.com/) and create or select the project.
2. Register a Web app under **Project settings > General**.
3. Copy the Web app configuration values into `.env.local` as described in [Environment variables](#environment-variables).

### 2. Enable Google Authentication

1. Open **Build > Authentication > Sign-in method**.
2. Enable the **Google** provider and select a support email.
3. Under **Authentication > Settings > Authorized domains**, add:
   - `localhost` for local development;
   - the exact Vercel hostname, such as `your-app.vercel.app`;
   - each production custom domain.

Enter hostnames only—do not include a protocol, path, or port. Add preview deployment hostnames individually if they must support sign-in.

### 3. Create Realtime Database

1. Open **Build > Realtime Database** and create a database.
2. Choose the region appropriate for the deployment.
3. Keep access closed until the repository rules have been deployed.
4. Copy the resulting database URL into `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.

### 4. Deploy database rules

Install and authenticate the Firebase CLI:

```bash
npm install --global firebase-tools
firebase login
```

From the project root, associate the local configuration with the Firebase project and deploy only the database rules:

```bash
firebase use --add
firebase deploy --only database
```

Select the intended project—`kogni-ai` when using that project—during `firebase use --add`. Review `database.rules.json` before deployment. The current rules deny all unspecified reads and writes, allow authenticated users to read the leaderboard, and limit each user to updating their own validated leaderboard record.

## Environment variables

Copy `.env.example` to `.env.local` and replace every placeholder with the Firebase Web app configuration from **Firebase console > Project settings > General > Your apps**:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_web_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is only used when Firebase Analytics is supported by the browser. Restart the development server after changing environment variables.

All `NEXT_PUBLIC_*` values are embedded in client JavaScript at build time. Firebase Web configuration, including its API key, is public project-identification data and is **not** a server secret or an authorization boundary. Security must come from Firebase Authentication, Realtime Database Rules, quotas, and abuse controls.

In Google Cloud Console, review the Firebase browser key and:

- apply HTTP referrer restrictions for the exact localhost, Vercel, and custom-domain origins that need access;
- restrict the key to only the Google APIs required by the deployed Firebase features, where compatible;
- monitor usage and quotas after applying restrictions, because an incorrect restriction can break sign-in or database access.

Never place service-account credentials, private keys, or unrestricted server keys in a `NEXT_PUBLIC_*` or `VITE_*` variable. Keep `.env.local` uncommitted.

### Firebase Admin server configuration

The browser web-app configuration cannot authenticate Firebase Admin. In **Firebase console > Project settings > Service accounts**, generate a key for an authorized service account in the same project. Store its `project_id`, `client_email`, and `private_key` as the following **server-only** environment variables; keep the JSON key outside this repository:

```dotenv
FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
```

Use the complete private key, not the placeholder above. Literal PEM line breaks and escaped `\n` line breaks are supported. Use the exact Realtime Database HTTPS URL; local/private addresses and non-Firebase hosts are rejected. Grant only the project permissions the service needs, protect the key, and rotate it if exposed. Add these variables to local `.env.local` and the intended Vercel environments, then restart/redeploy. A missing or invalid Admin configuration returns HTTP 503 with a generic public error; it cannot be repaired with browser rules or public API keys.

### Optional Firebase App Check

App Check can add abuse protection for Firebase resources. For a web deployment, register an appropriate provider (typically reCAPTCHA Enterprise), initialize App Check in the client before Firebase resource access, validate metrics, and only then enable enforcement for supported products. Use an App Check debug token during local development rather than weakening production enforcement.

App Check complements but does not replace Authentication or Database Rules, and it does not make browser-delivered configuration secret. It also does not protect the separate Gemini BYOK flow.

## Gemini BYOK and `@google/genai`

Magic Import is an optional bring-your-own-key (BYOK) feature. Local and shared decks can be browsed, practiced, and reviewed without Gemini settings. When a learner chooses generation, Kogni stores the user-entered Gemini key under `user_gemini_api_key` and the selected model ID under `user_gemini_model` in `localStorage`. It sends the key directly from the browser to Gemini only while generating. Every generated deck requires selecting a new PDF, JPEG, PNG, or WebP source file; Kogni does not retain that source after generation.

A key in `localStorage` is not secret from JavaScript running on the same origin. Cross-site scripting, compromised dependencies, malicious browser extensions, shared browser profiles, and local device access could expose it. Use a dedicated key with minimal API scope, quota, and billing exposure; apply available Google Cloud application/API restrictions; monitor usage; and revoke or rotate the key if exposure is suspected. Clearing the saved key or all site data removes the local copy. For stronger production isolation, move Gemini calls behind a trusted server and keep the key there.

Magic Import accepts PDF, JPEG, PNG, and WebP files up to 14 MiB. Files are sent as inline Base64 data; the raw limit leaves room for Base64 expansion and the surrounding JSON request beneath Gemini's whole-request inline limit. GIF is not accepted because support is inconsistent across Gemini models. Kogni does not use the Files API because each source is used once and the inline path avoids creating a separately retained remote file resource.

The project uses `@google/genai` v3 with the `GoogleGenAI` client and `ai.models.generateContent`. It currently:

- requires the user to configure a model ID available to their Google AI project;
- sends exactly one request to that configured model and never switches models automatically;
- uses a simplified JSON schema, then retries the same model once without the schema if strict structured output returns HTTP 400;
- sends the file as an inline base64 part;
- requests `application/json` with a response JSON schema;
- reads generated text from the response's `text` property;
- validates and normalizes the parsed result before saving it.

During generation, Magic Import displays a live semantic activity log for file preparation, the configured model request, same-model compatibility mode when needed, response processing, validation, and local saving. A modal interaction lock prevents accidental in-app navigation or account actions until the operation finishes, and the app registers a `beforeunload` warning while work is active. Generation still runs entirely in the browser: closing or reloading the tab, terminating the browser, device sleep, or process eviction can interrupt it, and the browser may suppress leave warnings in some environments.

Do not replace this with examples from the legacy `@google/generative-ai` SDK. Browser calls consume the user's Gemini quota, and model availability, pricing, file support, and quotas are controlled by the user's Google project.

### Google AI Studio key setup

AI generation requires a key from a Google AI Studio project the user controls or is authorized to use. Kogni provides no shared key. Existing/local/shared decks, Community, profiles, portals, leaderboards, practice, and review remain key-free.

1. Open [Google AI Studio API keys](https://aistudio.google.com/app/apikey) and sign in.
2. Create, import, or select a Google Cloud project you control.
3. Review that project's [pricing](https://aistudio.google.com/docs/pricing), [billing](https://aistudio.google.com/docs/billing), and [rate limits](https://aistudio.google.com/docs/rate-limits). Free-tier availability varies; paid projects may incur charges.
4. Choose **Create API key** for that project.
5. Copy the key into Kogni's **AI generation settings** and enter an exact model ID from the [models documentation](https://aistudio.google.com/docs/models).
6. Select **Test key and model**. Verification performs model metadata lookup only—it uploads no source and generates no content.
7. Save settings, select a PDF/JPEG/PNG/WebP source, then explicitly generate.

Prefer a dedicated project/key with limited billing exposure and monitored quotas. Apply compatible API and referrer restrictions for the exact Kogni origins, then test them. Restrictions mitigate misuse but do not make browser-exposed keys secret. The saved key remains readable to same-origin JavaScript, extensions, shared profiles, or people with device access. Remove settings in Kogni and revoke/rotate the key in Google AI Studio if exposure is suspected.

## Data model

### IndexedDB

Database: `FlashcardAppDB`, version `1`.

**`decks` store** (`id` key path)

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Deck identifier. |
| `title` | string | Display title. |
| `description` | string | Deck summary. |
| `cardCount` | number | Number of cards saved with the deck. |
| `createdAt` | number | Creation time in Unix milliseconds. |

Index: `createdAt`.

**`cards` store** (`id` key path)

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Card identifier. |
| `deckId` | string | Parent deck identifier. |
| `question` | string | Prompt shown to the learner. |
| `answer` | string | Correct answer. |
| `distractors` | string[] | Optional incorrect choices. |
| `interval` | number | Current review interval in days. |
| `repetition` | number | Successful repetition counter. |
| `easinessFactor` | number | SM-2 easiness factor. |
| `nextReviewDate` | number | Next due time in Unix milliseconds. |

Indexes: `deckId` and `nextReviewDate`.

### Firebase Realtime Database

Leaderboard records are stored at `leaderboard/{uid}`:

```json
{
  "uid": "firebase-user-id",
  "displayName": "Learner",
  "photoURL": "https://example.com/avatar.png",
  "xp": 120,
  "reviews": 15,
  "lastReviewAt": 1760000000000
}
```

The client subscribes to the 50 records with the highest `xp` and sorts them in descending order. Global rankings use `leaderboard/{uid}`. Deck rankings use `deckLeaderboards/{lineageId}/{uid}`; independent copies preserve the source lineage so scheduled reviews can contribute to the same deck ranking. Practice sessions never write scheduling progress or leaderboard XP.

### Community data

Users are absent from search by default. Enabling discoverability writes a public profile containing only UID, display name, normalized search name, optional HTTPS profile image, and update time. Email is never copied to the public directory. Search is authenticated, prefix-based, indexed by normalized display name, and limited to 20 results.

The deck page displays the source-grounded study guide and deck metadata without exposing card questions, answers, or distractors. Questions appear only after starting Learn & practice, Practice all, or Review due. Guide-enabled practice shows the summary again before questions, while scheduled review skips it to preserve unbiased recall. Legacy decks without a guide show an explanatory no-guide state and remain fully practicable.

### Local storage

| Key | Purpose |
| --- | --- |
| `user_gemini_api_key` | User-supplied Gemini API key. |
| `user_gemini_model` | Exact Gemini-compatible model ID used for Magic Import. |
| `kognit_theme` | Light or dark theme preference. |
| `kognit_xp` | Local dashboard XP display. |
| `kognit_streak` | Local dashboard streak display. |
| `kognit_leaderboard_review_events` | Client-side duplicate-submission markers. |

## Deck portal codes

Every owner-local deck can publish one reusable portal code. Codes use 12 cryptographically random Crockford Base32 characters and display as `XXXX-XXXX-XXXX`. A signed-in learner with an active, unexpired code can open `/portal/:code`, preview answer-free deck metadata, and add an independent local copy. Portal copies preserve deck lineage for rankings but receive new local IDs and reset schedules.

Portal codes expire after 1–30 days. Owners can renew, revoke, or rotate them. Revocation is permanent for that code and blocks future imports, but it cannot remove copies already saved in another browser. Portal publication is a snapshot: later source-deck edits do not synchronize. Firebase Authentication and exact-key rules protect reads, but this static SPA cannot provide IP rate limiting, automatic expired-record cleanup, or globally authoritative deck identity; higher-assurance portals require a trusted backend.

## Browser routes and guards

Kogni uses protected browser routes for Dashboard, Community, Import, deck pages, study sessions, leaderboards, and portal redemption. Guests who open a protected deep link are sent to `/sign-in` and returned only to a validated internal destination after authentication. External, protocol-relative, backslash, control-character, and sign-in-loop redirect targets are rejected. Deck routes reload owner-scoped IndexedDB data on refresh and show a route error when the deck is not available in the current browser.

## Privacy onboarding and canonical identity

Every Firebase-authenticated learner must complete `/onboarding` before using protected features. Onboarding requires a unique 3–24 character nickname and acknowledgement of `privacy-2026-11-10-ai-series-1`; Community discoverability and public Online/Offline presence are separate opt-ins that default off. The private `accounts/{uid}` record stores acknowledgement history and preferences, while `nicknameClaims` enforces case-insensitive uniqueness and public projections exclude email. See [PRIVACY.md](./PRIVACY.md). This product disclosure is not legal advice; deployment-specific compliance requires qualified counsel.

## Online and offline decks

Creator-owned online decks use immutable published versions with stable card IDs and content revisions. Owners control visibility, lifecycle, and the maximum number of questions that may be saved offline. Learners can save a deterministic first-N frozen snapshot into IndexedDB, with provenance recording the source deck, version, creator, selected count, and source card IDs. Offline snapshots never silently synchronize and cannot be remotely retracted after saving. Online schedules are isolated per UID/deck/card and use idempotent events plus schedule revisions; this remains a friendly client-trust model unless moved to a callable backend.

A small production service worker caches the same-origin application shell and loaded static assets. This supports cold navigation to cached routes and explicitly saved IndexedDB content; it does not make online-only Firebase features available without connectivity.

## Profile, presence, and mobile study UI

The protected Profile route uses the canonical nickname, versioned acknowledgement state, discoverability and presence controls, local learning stats, and separate public-presence versus device-connectivity indicators. The 3D card effect is decorative, disabled for touch/coarse pointers and reduced motion, and exposes no hover-only content. Mobile navigation uses daisyUI 4 `btm-nav`, and study sessions use horizontally scrollable daisyUI Steps with accessible current/completed/future labels.

## Editing, regeneration, and deletion

Owned local decks support metadata and card editing through owner-checked IndexedDB transactions. Changing a question, answer, or distractors resets only that card's schedule; title, summary, study guide, and reorder changes preserve progress. Substantive edits to imported/offline snapshots create a new fork/lineage so changed content does not share source rankings.

Kogni intentionally does not retain uploaded source files. Source-grounded regeneration therefore requires selecting the PDF/JPEG/PNG/WebP again and always creates a new independent deck; it never silently overwrites the old deck or its schedules. Local deletion removes the browser-local deck, cards, progress, and provenance and revokes an active portal first; published online versions and other learners' copies remain.

Online edits publish immutable successor versions. Metadata-only changes preserve card revisions, while changed learning content increments that card's revision and resets affected schedules. Online deletion is a terminal private tombstone: catalog/access ends, retained immutable versions may remain for audit/retention, and downloaded offline copies cannot be retracted.

## Study-guide answer coverage

New AI-generated and verified decks use the `literal-answers-v1` contract: every card's complete answer phrase must occur naturally in the study guide after Unicode NFKC, case, whitespace, quote, and hyphen normalization. Matching is boundary-aware, so short answers do not match inside larger words or numbers. Multiword answers remain contiguous; reordered words and semantic paraphrases do not count.

Kogni validates this locally after Gemini returns JSON, including schema-compatibility output and creator continuations. The guide remains explanatory prose—there is no answer bank or stored question-to-guide mapping. Legacy decks without the verification marker remain readable and practicable but do not carry this guarantee. Editing or publishing recomputes coverage; a stale marker is never trusted.

## Leaderboard trust model

The current leaderboard is suitable for friendly, non-authoritative use only. Realtime Database Rules validate record shape, ownership, timestamps, and bounded per-review XP increments, but the browser still decides when a review occurred and what quality score to submit. Client-side duplicate markers can also be cleared or modified. A determined authenticated user can therefore manufacture valid-looking review updates.

For a trusted or reward-bearing leaderboard, submit review events to a controlled backend or callable Cloud Function, verify and deduplicate them server-side, calculate XP on the server, and permit clients to read—but not directly write—aggregate leaderboard records.

## Deploy to Vercel

Kogni deploys as a Next.js application with Vercel Node.js functions:

1. Import the project into Vercel and select the **Next.js** framework preset.
2. Use `npm run build`; remove old `dist` output-directory overrides and static SPA rewrites. Let Vercel detect the Next.js output.
3. Set the public `NEXT_PUBLIC_FIREBASE_*` web-app variables and the four server-only `FIREBASE_*` Admin variables for each intended environment. Existing public `VITE_FIREBASE_*` names are an explicit migration fallback; new `NEXT_PUBLIC_*` values take precedence.
4. Deploy the database rules separately after reviewing the intended Firebase project and rule diff. This is not performed automatically by a Vercel deployment.
5. Deploy the application, then add its exact hostname to Firebase Authentication authorized domains.

Restart local development or redeploy after configuration changes. Public variables are compiled into the browser bundle. `next.config.ts` applies the browser-route fallback only after API/dynamic/static routes and excludes `/api` and `/_next`. `vercel.json` selects Next.js rather than rewriting all requests to `index.html`. The legacy static Firebase Hosting configuration does not host these Next.js APIs.

Presence, player profiles, and follow/unfollow work without Firebase database triggers. Optional legacy catalog/deck projection features under `functions/` have not been migrated by these fixes and require separate backend work if no such projections are maintained. Do not enable old trigger deployments unintentionally.

Verify direct browser-route refreshes, Google sign-in, API authentication/configuration errors, two-tab presence, preference opt-outs, repeated follow/unfollow, profile counts, portal redemption, and Gemini import before promoting a deployment.
