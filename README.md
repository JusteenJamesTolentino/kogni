# Kogni

## Overview

Kogni is an online study application for creating manual or AI-assisted flashcard decks, sharing or publishing decks, and reviewing them with spaced repetition. Normal new, manual, AI-generated, shared, and portal-imported decks—and their review schedules—are stored in Firebase for the signed-in account and require an internet connection.

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

Configure the public Firebase web values and server-only Firebase Admin values in `.env.local`:

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
```

`NEXT_PUBLIC_*` Firebase values identify the web app and are not server secrets. Never expose service-account credentials through public environment variables or commit `.env.local`. The deployed privacy-version configuration must match `privacy-2026-11-10-ai-series-1`.

## Architecture & Data Flow

```text
Signed-in browser
  ├─ Firebase Authentication
  ├─ Firebase Realtime Database
  │    ├─ account-backed deck heads and immutable versions
  │    ├─ per-account review schedules
  │    ├─ sharing, portals, profiles, presence, and leaderboards
  │    └─ private account and privacy acknowledgement
  ├─ Next.js /api/decks ── Firebase Admin ── owner-only deck metadata
  ├─ Gemini API (optional BYOK generation from the browser)
  ├─ localStorage: theme, sidebar preference, Gemini key/model, and client metadata
  └─ IndexedDB: untouched legacy decks exposed only by read-only recovery
```

All normal deck creation and study flows are online-only. Manual, AI-generated, shared, and portal-imported decks are saved to the signed-in Firebase account; schedules are also Firebase-backed. New deck content is private until the owner explicitly publishes it. Publishing changes access intentionally and does not occur as a side effect of creation.

The owner-only `GET /api/decks` endpoint authenticates a Firebase ID token, requires a ready account with the current privacy acknowledgement, and returns only active deck metadata owned by the caller. It does not use discoverability as an authorization boundary. Public deck discovery uses separate public-player and published-deck contracts.

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
| `npm run build` | Create the production Next.js build. |
| `npm run preview` | Serve the production build locally. |

### Deck lifecycle

1. Sign in and acknowledge Privacy Notice `privacy-2026-11-10-ai-series-1`.
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

### Gemini BYOK

Magic Import requires a Google AI Studio key and exact model ID configured by the user. Kogni stores both in `localStorage`, sends the key directly from the browser to Gemini only for key verification or generation, and does not include it in Firebase decks, shares, portals, logs, analytics, or URLs. A browser-stored key is readable by same-origin JavaScript, extensions, shared browser profiles, and people with device access; use a dedicated restricted key with controlled quota and rotate it if exposed.

Uploaded PDF, JPEG, PNG, or WebP source files are used for the generation request and are not retained by Kogni. Recipients do not use the creator's Gemini key or quota.

## Error Handling & Edge Cases

- Saving, loading, editing, reviewing, sharing, portal copying, and public publishing require connectivity. The application reports a connection error instead of falling back to IndexedDB.
- A timed-out cloud write may still complete. Retry by reloading the account library before attempting to create duplicate content.
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
- Presence can be briefly stale during network transitions. Discoverability and public presence remain separate opt-ins that default off.

See [PRIVACY.md](./PRIVACY.md) for the implemented data-handling disclosure. It is not legal advice; deployment-specific compliance and retention requirements require qualified review.
