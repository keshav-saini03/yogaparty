---
phase: 01-scaffold-deploy
plan: 02
status: complete
completed_at: 2026-04-27
---

# Plan 01-02 Summary: Provision, Push, Deploy

## What Shipped

**Task 1 — Supabase project provisioned and migration applied** (human-action checkpoint)
- Reused existing project `qmqsxefztguaqlphfnfq.supabase.co` (per user decision)
- All 4 tables created via `supabase/migrations/0001_init.sql` in SQL editor
- `supabase_realtime` publication includes `signups`, `rooms`, `squad_members`
- `.env.local` written with three credentials (URL, anon/publishable key, service role JWT)
- Verified gitignored before any git operations
- Local `npm run dev` smoke-test returned `YogaParty` placeholder

**Task 2 — GitHub repo created and pushed** (automated via `gh`)
- Repo: https://github.com/keshav-saini03/yogaparty (public)
- Owner: `keshav-saini03`
- Default branch: `main` with all 4 scaffold commits + README live-URL marker
- Remote `origin` set to `github-work:keshav-saini03/yogaparty.git`

**Task 3 — Vercel project linked and deployed** (human-action checkpoint)
- Vercel project: `yogaparty` under `keshav-saini03s-projects`
- Production URL: https://yogaparty-e7i5a1x9l-keshav-saini03s-projects.vercel.app/
- Stable production alias: https://yogaparty.vercel.app
- 3 env vars configured (Supabase URL + anon + service role JWT)
- Initial deploy: HTTP 200, "YogaParty" placeholder rendered
- Edge headers verified: `x-geo-city: Mumbai`, `x-geo-country: IN`, `x-vercel-id: bom1::*`
  → confirms `geolocation()` from `@vercel/functions` works on Edge runtime
- Auto-deploy verified: commit `004f541` triggered deployment ID 4494787404 with state `success`

## REQ-INFRA Acceptance — 5/5 ✓

| Criterion | Evidence |
|---|---|
| Next.js 15 App Router with Tailwind | `package.json` has `next@15.5.15`, `tailwindcss@4`; `app/page.tsx` exists |
| Supabase project + 4 tables via migration | User confirmed all 4 `count(*)` returned 0; publications ON for 3 tables |
| URL + anon key wired through Vercel env | All 3 env vars set in Vercel UI; service role scoped Production-only |
| `git push` to main triggers Vercel deploy | gh API: deployment `4494787404` for sha `004f541` state=success |
| Reachable production URL serves placeholder | `curl https://yogaparty.vercel.app` → HTTP 200, "YogaParty" present |

## Deviations

1. **Reused existing Supabase project** instead of creating a new one. User had a leftover project (`qmqsxefztguaqlphfnfq`) and confirmed safe to use. No data loss; clean schema applied via migration.

2. **Vercel deployment protection was on by default** (Hobby plan default since 2024). Disabled at user's hand to expose URL publicly. Required for hackathon — viral signups need a public URL.

3. **Env scoping for `SUPABASE_SERVICE_ROLE_KEY`** set to "Production and Preview" initially per user's Vercel UI default; subsequently changed to "Production only" per security recommendation. Best practice — service role key bypasses RLS.

4. **Smoke-test of auto-deploy was originally framed as "look for README change in browser"** — flawed because `README.md` isn't rendered. Pivoted to checking GitHub deployment status via `gh api`, which is the authoritative signal. Auto-deploy verified successfully.

5. **Vercel `yogaparty.vercel.app` alias did not auto-promote** to the new deployment after the smoke-test commit. This is a Vercel "Production Branch" setting that pins the clean alias to a specific deploy until manually promoted. Not blocking — deployment-specific URLs work for sharing. Can be fixed later in Vercel project settings.

## Open Items for Future Phases

- **Production alias auto-promotion** — toggle in Vercel Settings → Domains so `yogaparty.vercel.app` follows the latest production deploy automatically. Cosmetic only; deployment-specific URLs are fine.
- **Service role key rotation** — if exposed via mis-scoped env var at any point, rotate via Supabase dashboard. Not currently needed.
- **Type generation from Supabase schema** — `supabase gen types typescript` will be useful in Phase 2 when we start querying. Deferred per CONTEXT.md.

## Commits

- (orchestrator) `.env.local` written, gitignored, never committed
- `004f541` — docs: add live production URL to README (smoke-test commit)

## Final Production URL

**https://yogaparty.vercel.app** (stable alias)
or
**https://yogaparty-e7i5a1x9l-keshav-saini03s-projects.vercel.app/** (deployment-specific, will change on each deploy)
