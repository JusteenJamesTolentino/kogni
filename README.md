# Kogni

## Overview

Kogni is an online study application for creating manual or AI-assisted flashcard decks, sharing or publishing decks, reviewing them with spaced repetition, and running timed school quizzes. Quiz Integrity Mode is an optional, teacher-enabled behavioral-signal layer that is off by default. Normal new, manual, AI-generated, shared, and portal-imported decks—and their review schedules—are stored in Firebase for the signed-in account and require an internet connection.

New decks are private by default. A deck becomes publicly discoverable only after its owner explicitly confirms publication. Kogni no longer creates offline deck saves.

Existing IndexedDB decks are not migrated, changed, or deleted automatically. They are available only through **Legacy decks on this device**, a read-only recovery flow that previews a deck and requires confirmation before creating a private Firebase copy. Recovery leaves the device original and its schedule unchanged; the new cloud copy starts with a fresh schedule.

## Setup & Dependencies

- Hardware/Software Requirements: Node.js 22.x, npm, and a Firebase project with Google Authentication and Realtime Database.
- Key Packages: Next.js, React, Firebase client SDK, Firebase Admin SDK, `@google/genai`, Tailwind CSS, daisyUI, and `idb` for legacy recovery only.
- Verification Packages: TypeScript, Vitest, Oxlint, and Firebase Rules Unit Testing. Java is required for database emulator tests.

Install dependencies without replacing an existing environment file:

```bash
npm ci

# Create only when .env.local does not already exist.
# Windows Command Prompt
copy .env.example .env.local

# macOS/Linux
cp .env.example .env.local
```

Configure the public Firebase web values and server-only Firebase Admin, Functions, and R2 values in `.env.local`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_web_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
KOGNIT_PRIVACY_VERSION=privacy-2026-11-17-quiz-integrity-1

R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-bucket
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_PUBLIC_URL=https://your-public-r2-host.example
```

`NEXT_PUBLIC_*` Firebase values identify the web app and are not server secrets. `FIREBASE_*` Admin credentials and `R2_*` credentials are server-only; never expose them through public variables or commit `.env.local`. `KOGNIT_PRIVACY_VERSION` is a non-secret Functions/Next.js server setting: leave it unset to use the code default, or set it to exactly `privacy-2026-11-17-quiz-integrity-1`. The account export, API default, Functions default, Realtime Database rules, privacy notice, and deployment value must stay aligned; `test/lib/privacy-version.test.ts` guards this contract.

## Architecture & Data Flow

```text
Signed-in browser
  ├─ Firebase Authentication
  ├─ Firebase Realtime Database
  │    ├─ account-backed deck heads and immutable versions
  │    ├─ per-account review schedules
  │    ├─ sharing, portals, profiles, presence, and leaderboards
  │    ├─ immutable quizzes, owner-only answer keys, exact code lookup, and owner indexes
  │    ├─ server-owned quiz attempts and optional 30-day Integrity Mode signal logs
  │    └─ private account and privacy acknowledgement
  ├─ Firebase Cloud Functions (`functions/`) ── trusted projections and social callables
  ├─ Next.js quiz APIs ── Firebase Admin ── timed attempts, grading, and integrity signals
  ├─ Next.js /api/decks ── Firebase Admin ── owner-only deck metadata
  ├─ Gemini API (optional BYOK generation from the browser)
  ├─ localStorage: theme, sidebar preference, Gemini key/model, and client metadata
  └─ IndexedDB: untouched legacy decks exposed only by read-only recovery
```

All normal deck creation and study flows are online-only. Manual, AI-generated, shared, and portal-imported decks are saved to the signed-in Firebase account; schedules are also Firebase-backed. New deck content is private until the owner explicitly publishes it. Publishing changes access intentionally and does not occur as a side effect of creation.

The owner-only `GET /api/decks` endpoint authenticates a Firebase ID token, requires a ready account with the current privacy acknowledgement, and returns only active deck metadata owned by the caller. It does not use discoverability as an authorization boundary. Public deck discovery uses separate public-player and published-deck contracts.

Quiz creation is a client-side atomic multi-location write and requires a ready/current account whose self-asserted role is `teacher`. It stores immutable answer-free content, an owner-only answer key, a join code, and an owner index. Roles are honor-system labels rather than verified school authority. Client reads of the code collection and learner reads of quiz content are denied; quiz owners retain direct access for roster rendering. The trusted resolve API performs exact code lookup and returns metadata only, and the start/answer APIs reveal one current question at a time.

Timed quiz state is written only by trusted Next.js API code through Firebase Admin. The start/answer flow owns each 30-second per-question deadline, grades the result, and idempotently updates private statistics. When the Functions package is deployed, a daily cleanup advances abandoned attempts after their final deadline and physically removes expired raw signal logs; until then, expired logs are inaccessible under database rules but remain stored. Optional Integrity Mode is off by default. When enabled, the browser sends bounded focus/page-visibility, fullscreen, browser-reported connection, and session-replacement observations to trusted API routes; the server supplies receipt times. The student and quiz owner can read exact unexpired logs, while every client write to attempts and logs is denied. Raw signal access expires 30 days after grading.

Legacy recovery is the only path that reads `FlashcardAppDB`. It lists existing device decks without modifying them, shows a content preview, and creates a deterministic private cloud copy only after confirmation. The original cards and schedule stay in IndexedDB unchanged, while the cloud schedule begins fresh.

Kogni does not retain uploaded source files. AI generation sends the selected source to Gemini from the browser for that request; regeneration requires selecting the source again. The user-supplied Gemini API key remains in browser `localStorage` and is not stored in Firebase.

Deleting an online deck writes a terminal private tombstone. The deck is removed from active library/catalog access, but deletion must not be described as immediate physical erasure of every retained version or schedule record.

## Usage & API Reference

Start the development server:

```bash
npm run dev
```

Available verification commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check browser and Next.js API TypeScript. |
| `npm run lint` | Lint `src/` and `app/` with Oxlint. |
| `npm run test` | Run the Vitest suite outside `functions/`. |
| `npm run test:functions` | Run Functions tests. |
| `npm run test:rules` | Run Realtime Database authorization tests in the demo emulator. |
| `npm run deploy:functions` | Build and deploy the Node.js 22 Functions source from `functions/` via the Firebase predeploy hook. |
| `npm run build` | Create the production Next.js build. |
| `npm run preview` | Serve the production build locally. |

### Deployment and privacy version

Build and test with the same non-secret privacy version expected at runtime. The checked-in default is `privacy-2026-11-17-quiz-integrity-1`; if `KOGNIT_PRIVACY_VERSION` is supplied to Next.js or Firebase Functions, set exactly that value before deploying. Deploy Functions and Realtime Database rules as separate reviewed operations.

```bash
npm run test
npm run test:functions
npm run test:rules
npm run build
npm run deploy:functions
# Rules deployment is a separate reviewed operator step.
```

A version bump intentionally gates stale accounts until they acknowledge the revised Integrity Mode disclosure. Do not deploy mismatched app, API, Functions, or rules versions. Deploying Functions adds `reconcileQuizAttemptProjection` for retry-safe rank/badge effects and `cleanupQuizIntegrityRetention` for daily abandoned-attempt completion and raw-log deletion. Firebase requires the Blaze plan plus Cloud Build, Artifact Registry, and Cloud Scheduler APIs for this deployment.

### Deck lifecycle

1. Sign in and acknowledge Privacy Notice `privacy-2026-11-17-quiz-integrity-1`.
2. Create a deck manually, generate one with a locally configured Gemini key, or copy one through sharing/portal access.
3. Stay online while saving, loading, editing, practicing, or reviewing; deck content and schedules are account-backed.
4. Keep the deck private, or explicitly confirm **Publish publicly**.
5. Delete an online deck to replace its active state with a private tombstone.

### Legacy recovery

1. Open **Legacy decks on this device**.
2. Select an existing IndexedDB deck and review its preview.
3. Confirm **private cloud copy**.
4. Continue from the new account-backed deck with a fresh cloud schedule. The IndexedDB original and its schedule remain unchanged.

### Owner deck API

All requests require `Authorization: Bearer <Firebase ID token>`. The account must be ready and must acknowledge the current privacy version.

| Method and path | Contract |
| --- | --- |
| `GET /api/decks` | Returns `{ items, hasMore, nextCursor? }` for active deck metadata owned by the authenticated caller. Pages contain at most 20 items; `cursor` is the only accepted query parameter. |

```bash
curl -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  "http://localhost:3000/api/decks"
```

Treat `nextCursor` as opaque and URL-encode it on the next request. The endpoint rejects malformed queries, invalid or expired tokens, accounts without the current acknowledgement, invalid stored metadata, and owner libraries over the supported 500-deck listing limit.

### Quiz API

All quiz API requests require `Authorization: Bearer <Firebase ID token>`, a ready account, and Privacy Notice `privacy-2026-11-17-quiz-integrity-1`. JSON bodies require `application/json`, are capped at 64 KiB, and reject unknown fields. Attempts, grading state, statistics, and Integrity Mode logs are server-written through Firebase Admin.

| Method and path | Contract |
| --- | --- |
| `POST /api/quiz/resolve` | Resolves one exact `{ code }`, returning metadata and prior-attempt state without questions or answer material. |
| `POST /api/quiz/start` | Starts or resumes one server-timed attempt from `{ quizId, sessionId, fullscreenStart }`; returns only the active question or an existing completed result. Ordinary quizzes use `not-requested`; Integrity Mode uses `entered`, `unsupported`, or `denied`. |
| `POST /api/quiz/answer` | Applies one idempotent `{ quizId, attemptId, sessionId, questionId, operationId, chosenIndex }` answer at server receipt time. |
| `POST /api/quiz/events` | Accepts a bounded batch of Integrity Mode signals for the caller's current enabled attempt. |
| `GET /api/quiz/results/<quizId>/<uid>/signals` | Returns an unexpired signal log to its student subject or quiz owner. |

```bash
curl -X POST \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"quizId":"quiz_example","sessionId":"session_example_123","fullscreenStart":"entered"}' \
  "http://localhost:3000/api/quiz/start"
```

Quiz roles are self-asserted and changeable; use them for workflow selection, not verified school authorization. The resolve API reveals metadata only, and start/answer responses expose one current question at a time. Answer keys remain owner-only.

### Gemini BYOK

Magic Import requires a Google AI Studio key and exact model ID configured by the user. Kogni stores both in `localStorage`, sends the key directly from the browser to Gemini only for key verification or generation, and does not include it in Firebase decks, shares, portals, logs, analytics, or URLs. A browser-stored key is readable by same-origin JavaScript, extensions, shared browser profiles, and people with device access; use a dedicated restricted key with controlled quota and rotate it if exposed.

Uploaded PDF, JPEG, PNG, or WebP source files are used for the generation request and are not retained by Kogni. Recipients do not use the creator's Gemini key or quota.

### Avatar uploads (Cloudflare R2)

Profile photos are stored in Cloudflare R2. All Kogni objects live under the `kogni/` bucket prefix (`kogni/avatars/<uid>/<token>.<ext>`); nothing is ever written outside it. The flow is browser → presigned PUT → commit:

1. `POST /api/uploads/avatar` with `{ contentType, sizeBytes }` (Bearer ID token required) validates JPEG/PNG/WebP and the 2 MB cap, then returns a short-lived presigned `uploadUrl` scoped to `kogni/avatars/<uid>/`.
2. The browser PUTs the file directly to R2 — no file bytes transit the Kogni server.
3. `POST /api/uploads/avatar/commit` with `{ key }` re-verifies the key belongs to the caller's scope, confirms the object exists, records `{ url, path, updatedAt }` on `accounts/<uid>/avatar`, and **deletes the replaced avatar object** so storage stays flat (best-effort; a failed delete leaves at most one orphan).

The client never supplies the public URL — it is derived from the verified key against `R2_PUBLIC_URL`. Server configuration uses `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PUBLIC_URL`; all five names are listed in `.env.example`.

#### Bucket CORS

`cloudflare.cors.json` at the repo root is the canonical CORS configuration for the storage bucket; the browser PUT needs it to pass preflight. It is deliberately gitignored (local infrastructure config, not committed) — keep a copy alongside your Cloudflare credentials. Apply it with any S3-compatible client:

```bash
aws s3api put-bucket-cors \
  --endpoint-url "$R2_ENDPOINT" \
  --bucket "$R2_BUCKET_NAME" \
  --cors-configuration file://cloudflare.cors.json
```

The presigned upload deliberately pins only `Content-Type` and `Content-Length` — every signed header must be sent verbatim by the browser. `Cache-Control` is listed in `cloudflare.cors.json` but not yet signed: after applying this file, re-adding `CacheControl` to the presigned `PutObjectCommand` in `app/api/_lib/r2.ts` enables immutable browser caching of avatar objects.

## Error Handling & Edge Cases

- Saving, loading, editing, reviewing, sharing, portal copying, and public publishing require connectivity. The application reports a connection error instead of falling back to IndexedDB.
- A timed-out cloud write may still complete. Retry by reloading the account library before attempting to create duplicate content.
- Avatar uploads abort cleanly before any write if the file type or size is rejected. If the presigned PUT succeeds but the commit fails, the uploaded object is orphaned in `kogni/avatars/<uid>/` and the next successful replacement may not delete it (the commit only deletes the previously recorded avatar path).
- New decks remain private unless the owner completes explicit public-publication confirmation.
- Legacy recovery never mutates or deletes the IndexedDB source. If copying fails, the device deck and its schedule remain intact.
- A recovered cloud copy intentionally receives a fresh schedule; legacy due dates, intervals, repetitions, and answer history are not uploaded.
- Clearing browser data can remove legacy IndexedDB decks and local theme/sidebar/Gemini settings. It does not delete account-backed decks or schedules.
- Signing out removes the browser-local Gemini key/model settings but leaves theme/sidebar preferences and legacy IndexedDB records in place.
- Uploaded sources cannot be recovered from Kogni because they are not retained; AI regeneration requires reselecting the source.
- The Gemini key is local to the browser profile and is not synchronized with the account.
- Online deletion creates a terminal tombstone and ends active access. It is not a promise of immediate physical erasure from every retained record or backup.
- Invalid, expired, or missing Firebase ID tokens return an authentication error. Missing or malformed Firebase Admin configuration returns a sanitized service-unavailable response.
- Owner library pagination fails closed when stored metadata is invalid, a cursor is malformed, or the bounded listing limit is exceeded.
- Quiz Integrity Mode is off by default. It observes only page/window activity, fullscreen state, browser-reported connectivity, and session replacement; it is not a secure browser, proctoring system, or proof of cheating.
- Quiz publication retries an atomic write with a fresh code up to five times when rules return permission denied (the indistinguishable code-collision signal). Persistent permission errors—such as a stale privacy acknowledgement or non-teacher role—surface after the bounded retries.
- Integrity signals can be missing, delayed, blocked, duplicated, or forged and never alter scores automatically. They cannot expose other tabs/apps, split-view content, screens/devices, camera, microphone, screen recordings, keystrokes, location, IP address, or a device fingerprint.
- Server-owned 30-second question deadlines continue while hidden, suspended, or offline. Answers not received by the server by the deadline expire; local/offline timestamps do not make them timely.
- The student and quiz owner can read an exact Integrity Mode log until its 30-day expiration timestamp. The deployable daily cleanup completes abandoned attempts and deletes expired raw logs; it is not active until Functions are deployed, and backups follow separately reviewed retention.
- Learner reads of quiz codes and quiz content are denied; quiz owners retain direct read access to their own immutable content and roster. The authenticated resolve API performs one exact code lookup and discloses metadata only, and start/answer responses reveal one current question at a time.
- Quiz roles are honor-system labels. They must not be treated as verified teacher/student identity or institutional authorization.
- `KOGNIT_PRIVACY_VERSION` must be configured consistently on every deployed server surface. A stale host value fails closed and will reject otherwise current accounts until corrected.
- Presence can be briefly stale during network transitions. Discoverability and public presence remain separate opt-ins that default off.

See [PRIVACY.md](./PRIVACY.md) for the implemented data-handling disclosure. It is not legal advice; deployment-specific compliance and retention requirements require qualified review.
