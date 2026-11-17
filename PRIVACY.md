# Kogni Account and Study Data Privacy

Effective version: `privacy-2026-11-17-quiz-integrity-1`

This document describes how the implemented Kogni account, online deck, study, sharing, recovery, quiz, and presence features handle data. It is a product disclosure, not legal advice or a substitute for a privacy policy reviewed for every jurisdiction where Kogni is offered.

## Private account record

After onboarding, Kogni stores an owner-readable Firebase account record containing:

- the Firebase user ID;
- the chosen nickname and lowercase canonical form;
- account creation and update timestamps;
- the acknowledged privacy version, timestamp, and acknowledgement history; and
- discoverability and presence preferences.

Discoverability and presence default to `false`. This implementation does not copy the authentication email address into account or public profile records.

## Online decks and schedules

Normal new, manual, AI-generated, shared, and portal-imported decks are Firebase account-backed and require an internet connection. Their review schedules are also stored in Firebase for the signed-in account. Kogni no longer creates offline deck saves.

New decks are private by default. A deck becomes publicly accessible or discoverable only after its owner explicitly confirms publication. Sharing and portal access expose content according to the access the owner intentionally grants; they do not make every owner deck public.

Deleting an online deck creates a terminal private tombstone that ends active library, catalog, sharing, and study access. This is not a promise of immediate physical erasure: retained immutable versions, schedules, audit data, or backups may remain according to service retention and operational requirements.

## Legacy decks on this device

Existing decks in this browser's IndexedDB are not automatically uploaded, modified, scheduled in the cloud, or deleted. They are exposed only through the explicit, read-only **Legacy decks on this device** recovery screen.

Recovery first shows a deck preview and then requires confirmation before uploading that deck's content as a new private Firebase copy. The original IndexedDB deck and its schedule remain unchanged. The new cloud copy starts with a fresh review schedule; legacy due dates, intervals, repetitions, and answer history are not copied.

Legacy device data can remain after sign-out and can be lost if browser site data is cleared. It is not available from another browser or device unless the user explicitly recovers it to the account first.

## Browser-local settings

The theme, sidebar preference, Gemini model settings, and user-supplied Gemini API key remain local to the browser. The Gemini key is stored in `localStorage`, is not synchronized through Firebase, and can be read by same-origin scripts, extensions, shared browser profiles, or people with device access. Users should use a dedicated restricted key, control its quota, and revoke or rotate it if exposure is suspected.

Signing out removes the local Gemini key/model settings but does not automatically remove theme/sidebar preferences or existing legacy IndexedDB data. Clearing site data removes all of them from that browser but does not delete account-backed decks or schedules.

## Uploaded sources and optional Gemini BYOK

Kogni provides no shared Gemini key. AI deck creation and source-grounded regeneration require the user's own Google AI Studio key, model access, project quota, and any resulting charges. Explicit settings verification sends a key-authenticated model metadata request but uploads no source and generates no content.

Generation sends the selected PDF, JPEG, PNG, or WebP source from the browser to Gemini for the requested generation. Kogni does not retain the uploaded source file. Regeneration therefore requires selecting the source again. The Gemini key is never stored in Firebase or included in decks, shares, portals, activity logs, analytics, or URLs. Recipients do not use the creator's key or quota.

Creators may explicitly generate a continuation from disclosed published-series context using their locally configured key and quota. Players do not trigger Gemini generation or charges by completing a part, and player ratings or private schedules are not sent for continuation generation.

## Nicknames, discoverability, and presence

Nicknames contain 3–24 ASCII letters, digits, or underscores and are unique without regard to case. Onboarding atomically reserves the canonical nickname and creates the private account. Renaming reserves the new claim, updates enabled projections, and releases the old claim.

Discoverability is opt-in. When enabled, Kogni may publish the user ID, nickname, canonical nickname, and projection update timestamp. Disabling it removes the searchable projection.

Presence is separately opt-in and uses opaque per-session markers. Eligible signed-in learners receive only a coarse `{ online: boolean }`, not exact disconnect or last-seen time, IP address, device, user agent, or raw session IDs. Disconnect cleanup removes session markers, but network transitions can make presence briefly stale.

## Public profiles, following, and community data

Discoverable profiles may show the canonical nickname, Community XP labeled client-reported, aggregate follower/following counts, published-deck count, and coarse presence. They do not show email, provider identity, acknowledgement history, private decks, private schedules, review history, follower identities, devices, IP addresses, or exact last-seen time.

Following is immediate but grants no deck or presence access. Blocking is private, removes follows in both directions, and prevents public profile retrieval. Community XP is client-reported and unsuitable for rewards, permissions, moderation, or other authoritative decisions.

## School quizzes and optional Quiz Integrity Mode

Quiz roles (`student` or `teacher`) are self-asserted, changeable, and honor-system labels. They are not verified school authority, enrollment, employment, age, or identity credentials. Only an account currently labeled `teacher` can create quizzes in the client, but that label is not an authorization by a school.

Teacher-created quizzes store the question set, an owner-only answer key, and a join code. Quiz content and prior-attempt metadata are delivered to students through authenticated server endpoints rather than direct database reads; the answer key remains owner-only. A student's quiz attempt stores chosen choices, server-owned per-question timing state, correct count, percentage score, grading timestamp, and nickname. The student and quiz owner can read the attempt after acknowledging the current privacy notice. Attempts do not award XP, change spaced-repetition schedules, or enter leaderboards.

Per-student quiz aggregates include quizzes taken and passed, streaks, total correct, total questions, and an internal idempotency ledger used to avoid applying the same attempt twice. Auto-granted status badges can derive from quiz activity. The owning student can read their aggregates; public projection occurs only where separately disclosed and enabled.

Integrity Mode is optional, teacher-enabled per quiz, and off by default. Enabling it stores an immutable quiz policy with the teacher's acknowledgement of this disclosure. During an enabled timed attempt Kogni may collect bounded behavioral signals for:

- page visibility or browser-window focus interruptions;
- whether requested fullscreen was entered and when fullscreen ended;
- browser-reported online/offline connection interruptions; and
- replacement of the active quiz session by another session.

Browser observation times and durations are untrusted client-reported values; Kogni also stores a server receipt time. The student who produced the log and the quiz owner may access that exact log while it is retained and after acknowledging the current privacy version. Raw Integrity Mode logs receive a 30-day deletion/access-expiration timestamp after grading. The included daily trusted cleanup, once deployed, completes abandoned timed attempts, assigns their deadline-based grading timestamp, and physically removes raw logs after expiry. Until that Functions deployment is active, expired logs are inaccessible under database rules but remain stored; backups or operational records may follow their separately reviewed retention schedule.

These signals can be absent, delayed, duplicated, blocked, or forged. They are contextual observations only: they never prove cheating, never produce an automated misconduct verdict, and never alter a score automatically. Integrity Mode cannot reveal the contents of another tab or app, split-view content, screens, nearby devices, or what a person is doing away from the quiz. It does not use camera, microphone, screen recording, keystroke capture, location, IP-address logging, or device fingerprinting.

Integrity Mode can reduce simple timer bypass, but it is not secure-browser, kiosk, proctoring, or surveillance software. Server-owned per-question deadlines continue while a page is hidden, a device sleeps, or the browser is offline. Answers not received by the server on time expire; locally selected or queued offline answers are not treated as timely merely because the browser reports an earlier local time.

## Access controls and user controls

Realtime Database rules default to deny and enforce owner-only access for private account records, private decks, and per-account schedules. Quiz creation requires a ready account, the current privacy acknowledgement, and the account's self-asserted teacher role. Learner clients cannot read quiz codes or quiz content; quiz owners retain direct access to their own content and roster, while the authenticated server performs exact code resolution and timed question delivery. Quiz attempts and unexpired Integrity Mode logs are readable only by their student subject or quiz owner; every client write to attempts and signal logs is denied because trusted server code owns them. The owner-only `/api/decks` endpoint requires Firebase authentication, a ready account, and the current privacy acknowledgement, and returns only active deck metadata owned by the caller. Discoverability is not used to authorize access to the owner's private library.

Implemented controls include:

- choosing or renaming a nickname;
- choosing or switching the quiz role;
- enabling or disabling discoverability;
- enabling or disabling presence;
- keeping new decks private or explicitly publishing them;
- deleting an online deck to create a private tombstone;
- reading the signed-in user's account-backed library;
- previewing and explicitly recovering legacy device decks as private cloud copies; and
- taking timed quizzes with a code, knowing the student and quiz owner can read the resulting attempt; and
- reviewing an optional Integrity Mode disclosure before a teacher enables its bounded behavioral signals for a quiz.

Disabling discoverability removes public profile projections, and disabling presence removes active presence sessions. The daily quiz cleanup deletes expired raw Integrity Mode logs, while backups or other historical immutable records may retain data required by their separately reviewed retention contract. Complete account deletion must coordinate Firebase Authentication deletion with cleanup or retention of all owned account, deck, schedule, sharing, social, and legacy data before it is presented as a complete deletion control.
