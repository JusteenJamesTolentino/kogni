# Kognit Account Privacy and Presence

Effective version: `privacy-2026-11-10-ai-series-1`

This document is a product disclosure describing how the implemented Kognit account, onboarding, nickname, discoverability, and presence features handle data. It is not legal advice and is not a substitute for a privacy policy reviewed for the jurisdictions where Kognit is offered.

## Private account record

After a signed-in person completes onboarding, Kognit stores an owner-readable account record containing:

- the Firebase user ID;
- the chosen nickname and its lowercase canonical form;
- account creation and update timestamps;
- the privacy disclosure version acknowledged, its timestamp, and acknowledgement history; and
- discoverability and presence preferences.

Both preferences default to `false`. Authentication-provider data such as email addresses is not copied into account or public profile records by this implementation.

## Nicknames

Nicknames must contain 3–24 ASCII letters, digits, or underscores. Kognit reserves the lowercase canonical nickname in a separate claim, so names are unique without regard to case. For example, `Study_User` and `study_user` are the same claimed identity.

Onboarding writes the nickname claim and private account atomically. Renaming atomically reserves the new claim, updates the account and any enabled public projection, and releases the former claim. Claims themselves are not readable by clients.

## Discoverability

Discoverability is opt-in. When enabled, Kognit publishes only:

- user ID;
- nickname;
- canonical nickname; and
- projection update timestamp.

No email address is included. Disabling discoverability removes the projection.

## Presence

Presence is opt-in and is tracked as opaque per-session markers. Multiple tabs or devices can each register a session. The public API aggregates these markers to `{ online: boolean }` and intentionally does not expose exact disconnect time or last-seen time.

Firebase disconnect cleanup removes a session marker when that connection ends. Presence can therefore be briefly stale during network transitions, and it communicates availability rather than guaranteed activity.

Disabling presence removes the user's current session markers as part of the preference update. A ready, privacy-acknowledged account is required to read another opted-in user's presence.

## AI-generated deck series

Creators may explicitly generate a continuation part from the published series topic, study guide, and prior series questions using the creator's locally configured Gemini key and quota. Players do not trigger Gemini generation or AI charges by completing a part. Kognit does not send player ratings or private schedules for continuation generation. The creator reviews and publishes each continuation before it becomes available to learners.

## Public player profiles and following

Discoverable signed-in learners may have a Functions-owned public player projection containing only UID, canonical nickname, Community XP labeled client-reported, follower/following counts, and published-deck count. Public profiles do not include email, provider identity, acknowledgement history, local/offline decks, schedules, review history, last-seen time, raw presence sessions, devices, IP addresses, or follower identities.

Following is immediate and does not grant deck or presence access. Public pages show aggregate counts only; follower/following identities remain private to the account owner. Blocking is private, removes existing follows in both directions, and prevents public profile retrieval. Disabling discoverability removes the public profile and existing follow edges. Exact public deck URLs retain their separate deck-visibility behavior, and already downloaded copies cannot be retracted.

Community XP is client-reported and unverified. It is not suitable for rewards, permissions, moderation, or other authoritative decisions.

## Editing, regeneration, and deletion

Kognit does not retain uploaded source files. Source-grounded regeneration requires the learner to select the source again and creates a new independent local deck, leaving existing progress and publications unchanged. Editing a question, answer, or distractors resets that card's local learning schedule; editing deck metadata or the study guide does not.

Deleting a local deck removes its cards, local schedules, and snapshot provenance from that browser and revokes an active portal by default. It does not remove online published versions, direct-share snapshots, portals already imported elsewhere, or other learners' offline copies. Online deletion is a terminal private tombstone rather than immediate physical erasure; retained immutable versions and online schedules follow the service retention policy.

## Study-guide coverage

New verified decks require each complete answer phrase to appear naturally in the study guide after deterministic Unicode, case, whitespace, quote, and hyphen normalization. Kognit does not store an explicit question-to-answer or card-to-guide mapping. This is a syntactic coverage guarantee, not a claim that the guide proves the answer's factual accuracy. Legacy unverified decks may not provide this guarantee.

## Optional Google AI Studio BYOK

Kognit does not provide a shared Gemini key. AI import, source re-upload regeneration, and creator continuation generation require the user or creator's own Google AI Studio key, model access, project quota, and any resulting charges. Browsing, copying, practicing, reviewing, Community, profiles, leaderboards, and shared decks remain key-free.

Explicit settings verification sends a key-authenticated model metadata request to Google but creates no content and uploads no source. Generation sends the selected source file or the published continuation context disclosed to the creator. A saved key remains a browser-readable localStorage value and may be accessible to same-origin scripts, extensions, shared browser profiles, or people with device access. It is never stored in Firebase or included in decks, shares, portals, activity logs, analytics, or URLs. Recipients and players never use the creator's key or quota. Users can remove settings, sign out, clear site data, or revoke/rotate a key in Google AI Studio.

## Access controls and retention

Realtime Database rules default to deny and provide owner-only access to private accounts. New account, public-account, nickname-claim, and presence paths enforce their contracts. Existing legacy product paths retain their prior access model until their callers are integrated with account readiness.

Account acknowledgement history and timestamps remain with the private account record. Public projections are removed when discoverability is disabled. Session markers are removed on disconnect, explicit stop, or when presence is disabled.

## User controls

The backend contracts support:

- choosing or renaming a nickname;
- enabling or disabling discoverability;
- enabling or disabling presence; and
- reading the signed-in user's private account record.

Account deletion is not added by this backend slice and must be coordinated with authentication deletion and cleanup of all owned legacy data before being presented as a complete deletion control.
