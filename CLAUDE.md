# CLAUDE.md

Guidance for Claude Code working in this repo.

## Stack

Next.js 15 (App Router, RSC), TypeScript strict, Supabase Postgres + Edge Functions, deck.gl, LangGraph, OpenRouter. Package manager is pnpm.

## Commands

- `pnpm dev` — local dev server
- `pnpm typecheck` — `tsc --noEmit`, must pass before any commit
- `pnpm lint` — eslint + prettier check
- `pnpm test` — vitest, unit only
- `pnpm db:types` — regenerate Supabase types into `lib/db/types.ts`
- `pnpm ingest:dev` — run the AIS ingestion function locally against the dev project

## Never do without asking

1. Run or generate a Supabase migration (`supabase/migrations/*`). Propose the SQL, wait for approval.
2. `git commit`, `git push`, or any history-rewriting command.
3. Touch `.env`, `.env.local`, or anything in `supabase/config.toml`. If a secret is missing, say so.
4. Install a new dependency. Propose it with rationale first.
5. Delete or truncate tables, even in dev.

## Canonical docs

ARCHITECTURE.md, DECISIONS.md, and DIFFERENTIATION.md at the repo root are load-bearing. Read them before any non-trivial change. If your work would contradict them, propose an edit to the doc first, wait for approval, then implement.

## Style

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any`, no `as any`, no `@ts-ignore`. Use `unknown` + narrowing.
- Early returns over nested conditionals. Guard clauses at the top of functions.
- One React component per file. Colocate its types and tests; no barrel exports.
- Server components by default. Add `"use client"` only when a hook or event handler requires it.
- No em-dashes in comments, commit messages, or UI copy. Use a period, a comma, or parentheses. This rule is load-bearing for voice consistency across the app.
- Tailwind for styling. No inline `style` except for computed values (positions, widths).
