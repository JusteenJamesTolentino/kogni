<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Agent Guardrails & Execution Rules

**CRITICAL:** These rules are mandatory for all primary agents and subagents operating in this repository. Violating these constraints wastes API budget and breaks project architecture.

## 1. Strict Free-Tier Infrastructure Rule

- **NO Paid-Tier Services:** Never introduce Firebase Blaze-only features, Cloud Functions, scheduled backend jobs, paid third-party APIs, or server-side infrastructure that requires billing.
- **Client-First Execution:** Implement features such as quiz tab/split-view monitoring, timers, and UI state tracking using standard browser APIs (`visibilitychange`, `blur`, `focus`), local state, and existing free-tier Firebase/Auth capabilities.
- **Ask Before Changing Stack:** Do not modify `firebase.json`, deployment targets, database schemas, or security rules unless explicitly requested in the prompt.

## 2. Anti-Loop & Subagent Restrictions

- **No Unsolicited Subagents:** Do not spawn specialized subagents, parallel explorer agents, or automated code-review agents unless the user explicitly types `use subagents` in the prompt.
- **Single-Pass Execution:** Never run recursive inspection or correction loops across overlapping files. Read only the exact files needed for the task.
- **Hard Stop Condition:** Once the requested feature works and passes verification, stop immediately. Do not perform unsolicited codebase audits, refactors, or nice-to-have additions.

## 3. Minimal Scope & Diff Discipline

- **Smallest Safe Patch:** Always choose the simplest, smallest possible code change that solves the exact user request.
- **Plan Before Writing:** For any task touching more than one file, output a concise 3-to-5 bullet plan listing the exact files to be modified and wait for the user to reply `approved` before writing code.
- **No Scope Creep:** Do not rewrite surrounding components, rename variables outside the diff, or alter unrelated styling.

## 4. Token-Saving Testing Protocol

- **Targeted Tests Only:** During development, run only the single relevant test file, for example `npx vitest run path/to/specific.test.ts`.
- **One Final Check:** Run a full build or test suite at most once at the very end of the task—never repeatedly between minor edits.
- **No Blind Retries:** If a test or build fails twice with the same error, stop and ask the user for guidance instead of looping through guesses.
