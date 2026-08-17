# CI/CD & Technical Health Verification Guide

## Overview
This document outlines the technical health status, verification routines, and quality gates for [cosmic-orb-project](https://github.com/a20978236-coder/cosmic-orb-project).

## Quality Gates & Verification Scripts

The repository enforces strict quality standards via Bun and npm scripts:

| Check | Command | Description | Status |
|---|---|---|---|
| **Unit Tests** | `bun test` | Executes 10 unit tests in `src/__tests__/app.test.ts` (23 assertions) | ✅ 10/10 Passing |
| **Typecheck** | `bun run typecheck` | Strict TypeScript compilation (`tsc --noEmit`) | ✅ 0 Errors |
| **Lint** | `bun run lint` | ESLint verification | ✅ 0 Warnings / Errors |
| **Formatting** | `bun run format` | Prettier code style formatting | ✅ Clean |

## Test Suite Coverage (`src/__tests__/app.test.ts`)
1. **API Endpoints & Contracts**:
   - `/api/chat` SSE stream and simulation fallback.
   - `/api/tts` browser SpeechSynthesis fallback handling.
2. **Core Modules & Parsers**:
   - `engineering-parser.ts`: JSON structure parsing, component bounding (`[1, 12]`), fallback handling.
   - `error-capture.ts`: Global error queue and `consumeLastCapturedError()` handling.
   - `utils.ts`: Tailwind class merging (`cn()` utility).
3. **Route Integrity**:
   - Route exports and file-based route definitions across all views.

## Synchronisation & Lovable Git Rules
- Do not rewrite published Git history (`git push --force`, rebase/amend on synced branches).
- Ensure all quality gates (`test`, `typecheck`, `lint`) pass cleanly before merging to `main`.
