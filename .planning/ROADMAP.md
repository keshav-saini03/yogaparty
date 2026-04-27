# ROADMAP: YogaParty

**Milestone:** Hackathon MVP (single milestone — all 7 phases roll up)
**Window:** Mon Apr 27 09:00 → Tue Apr 28 21:00, 2026 (48 hours)
**Granularity:** Standard (7 phases mirroring the SPEC's P0–P6 layered priority)
**Coverage:** 16 / 16 v1 requirements mapped

The phases mirror the SPEC's "always-shippable" layered build priority. After every phase, `main` is in a deployable, demo-able state. The fallback cut line is end-of-Phase 4 (≈ P3 in the SPEC), which still represents a complete product: "watch together + invite friends."

## Phases

- [ ] **Phase 1: Scaffold & Deploy** — Next.js 15 + Supabase + Vercel deploys on `git push`
- [ ] **Phase 2: Landing & Signup** — Cold visitors become rows in `signups` from a mobile-first landing
- [ ] **Phase 3: City Watch Room** — Synced YouTube + chat + presence in a city-scoped room
- [ ] **Phase 4: WhatsApp Sharing & Referral** — Every signup can invite friends; referrals attribute correctly
- [ ] **Phase 5: Competition Engine** — City leaderboard + live signup counter drive city-vs-city virality
- [ ] **Phase 6: Squad Rooms** — Private friend-group watch parties with WhatsApp invites
- [ ] **Phase 7: Polish & Reactions** — Emoji reactions, mobile-first sweep, share prompts everywhere

## Phase Details

### Phase 1: Scaffold & Deploy
**Goal:** A Next.js 15 app talks to Supabase and ships to Vercel on `git push`, ready to host every subsequent feature.
**Depends on:** Nothing (first phase)
**Requirements:** REQ-INFRA
**Success Criteria** (what must be TRUE):
  1. Visiting the production Vercel URL returns a 200 with a placeholder homepage
  2. The four tables (`signups`, `squads`, `squad_members`, `rooms`) exist in Supabase with the locked schema applied
  3. Pushing a trivial commit to `main` triggers a successful Vercel production deploy without manual steps
  4. Supabase URL + anon key are available to the app via environment variables on Vercel
**Plans:** 2 plans
- [ ] 01-01-PLAN.md — Scaffold Next.js 15 + Supabase clients + migration SQL (autonomous)
- [ ] 01-02-PLAN.md — Provision Supabase, push to GitHub, link Vercel, verify deploy (checkpoints)

### Phase 2: Landing & Signup
**Goal:** A cold visitor — Indian or international — lands on `/`, completes the 3-field signup, and a row appears in `signups` with their detected city and (if present) referrer.
**Depends on:** Phase 1
**Requirements:** REQ-LANDING, REQ-SIGNUP, REQ-INTERNATIONAL
**Success Criteria** (what must be TRUE):
  1. A first-time visitor to `/` sees the hero, the social-proof line for their detected city, the top-5 cities preview, and a single CTA — bundle stays under 100KB and loads under 2s on a 4G mobile profile
  2. A visitor can submit Name + Phone + Country Code on `/signup` with no OTP / password / email field, and a row lands in `signups` with their detected city
  3. A visitor with a non-`+91` country code can complete signup, has a non-IN city detected, and is redirected to that international city's room
  4. Submitting with an already-used phone number shows a friendly duplicate error instead of a 500
**Plans:** 4 plans
- [ ] 02-01-PLAN.md — Foundations: lib/geo, lib/types, lib/country-codes, room placeholder (Wave 1)
- [ ] 02-02-PLAN.md — Server action createSignup with 23505/23503 handling (Wave 2)
- [ ] 02-03-PLAN.md — Landing page + 5 components (Hero, SocialProof, CityPreview, CounterPlaceholder, ReferralCapture) (Wave 2, parallel with 02-02)
- [ ] 02-04-PLAN.md — Signup form, signup page, smoke test, bundle audit (Wave 3, has checkpoint)
**UI hint**: yes

### Phase 3: City Watch Room
**Goal:** After signup, users land in their city's room and watch a Habuild yoga video together — playback synced, chat live, presence visible. This is the moment the product becomes a product.
**Depends on:** Phase 2
**Requirements:** REQ-CITY-ROOM, REQ-ROOM-SYNC, REQ-CHAT, REQ-PRESENCE, REQ-CONTENT-LIST
**Success Criteria** (what must be TRUE):
  1. Two users with the same detected city land in the same `/room/[id]` and see a "{N} people from {city} watching right now" header that reflects both of them
  2. The first joiner of a room sees host controls (play/pause/seek + video picker); the second joiner does not — and when the host leaves, the next person becomes host
  3. When the host plays, pauses, or seeks a Habuild video chosen from the curated list, every other client mirrors the action within ~2 seconds; a client whose drift exceeds 2s is corrected by a `sync_correct` from the host
  4. A message sent in chat appears for everyone in the room with sender name and timestamp; mobile renders chat as a bottom sheet, desktop as a sidebar
  5. Joining and leaving the room updates the live participant count and list for everyone else without a page refresh
**Plans:** TBD
**UI hint**: yes

### Phase 4: WhatsApp Sharing & Referral
**Goal:** Every signup becomes a node in a referral graph. Sharing happens via WhatsApp with prewritten Hinglish copy, and the referrer of every new signup is correctly attributed.
**Depends on:** Phase 3
**Requirements:** REQ-WHATSAPP-SHARE, REQ-REFERRAL
**Success Criteria** (what must be TRUE):
  1. From a city room, tapping "Invite Friends on WhatsApp" opens WhatsApp on a phone with the SPEC's Hinglish post-signup copy and a `?ref={userId}` link to YogaParty
  2. A visitor who lands via `?ref={userId}` and signs up has that referrer recorded in `signups.referrer_id`; the value persists across page navigations before submit
  3. All four share triggers (post-signup, in-room invite, city-competition prompt, post-session) are wired and use `https://wa.me/?text={encoded}`
  4. A user cannot accidentally self-refer — passing their own id as `?ref` is ignored at signup time
**Plans:** TBD

### Phase 5: Competition Engine
**Goal:** Cities visibly compete with each other and visitors see signup momentum in real time. The leaderboard becomes the share-bait that drives the third viral moment.
**Depends on:** Phase 4
**Requirements:** REQ-LEADERBOARD, REQ-LIVE-COUNTER
**Success Criteria** (what must be TRUE):
  1. `/leaderboard` ranks cities DESC by signup count and shows top-20 referrers DESC by referral count, refreshing without manual reload at least every 30s
  2. The landing page shows a total signup counter with India / International split that ticks up in real time (or within 30s) when new signups occur
  3. Each city row exposes a "Share city" button that opens WhatsApp with the SPEC's city-competition Hinglish copy and a `?ref` link
  4. The leaderboard renders correctly with zero data, with one city, and with many cities (no layout shift, no NaN, no crash)
**Plans:** TBD
**UI hint**: yes

### Phase 6: Squad Rooms
**Goal:** A user can create a named private squad, share a WhatsApp invite link, and watch with friends in a private room — adding a second viral loop on top of the city loop.
**Depends on:** Phase 5
**Requirements:** REQ-SQUAD-ROOM
**Success Criteria** (what must be TRUE):
  1. A signed-up user can name a squad on `/squad`, get a `wa.me` link containing `/join/{inviteCode}`, and share it
  2. Tapping a `/join/{inviteCode}` link routes a recipient through signup (if needed) and lands them in that squad's private room with a `squad_members` row created
  3. The squad room shows a persistent "squad incomplete" banner until member count ≥ 3, and the banner disappears once the threshold is met
  4. Members see the live member list inside the squad room and can use sync + chat exactly as in city rooms
**Plans:** TBD
**UI hint**: yes

### Phase 7: Polish & Reactions
**Goal:** Multiplier-only work: emoji reactions, mobile-first sweep across every page, and a share prompt at every viral moment. This is what differentiates a working hackathon product from a memorable one.
**Depends on:** Phase 6
**Requirements:** REQ-REACTIONS, REQ-POLISH-MOBILE
**Success Criteria** (what must be TRUE):
  1. Inside any room, tapping any of at least four emoji broadcasts a `reaction` event and renders a visible animated reaction on every other client in the room
  2. Each viral moment screen — post-signup, in-room, leaderboard, post-session — surfaces a WhatsApp share prompt without the user hunting for it
  3. At 360px width every page (`/`, `/signup`, `/room/[id]`, `/squad`, `/join/[code]`, `/leaderboard`) renders without horizontal scroll and primary CTAs have ≥ 44px tap targets
  4. The Phase 4 fallback ship line is preserved: removing Phase 7 from the build leaves the product fully functional (no Phase 7 code is on a critical path)
**Plans:** TBD
**UI hint**: yes

## Dependency Graph

```
Phase 1 (Scaffold)
   └─ Phase 2 (Landing & Signup)
          └─ Phase 3 (City Watch Room)
                 └─ Phase 4 (WhatsApp & Referral)   ← FALLBACK SHIP LINE
                        └─ Phase 5 (Competition Engine)
                               └─ Phase 6 (Squad Rooms)
                                      └─ Phase 7 (Polish & Reactions)
```

Linear dependencies only — no parallelism, since the implementer is solo and Phase N's success criteria reference Phase N-1's surfaces.

## Time Budget Mapping (from SPEC P0–P6)

| Phase | SPEC priority | Phase budget | Cumulative |
|---|---|---|---|
| 1 | P0 | ~2h | 2h |
| 2 | P1 | 3–4h | ~6h |
| 3 | P2 | 6–8h | ~14h |
| 4 | P3 | 3–4h | ~18h |
| 5 | P4 | 3–4h | ~22h |
| 6 | P5 | 3–4h | ~26h |
| 7 | P6 | 2–3h | ~29h |

Hours are SPEC-provided guidance, not commitments. The 48-hour window includes sleep, eating, demo prep, and unknowns.

## Progress

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. Scaffold & Deploy | 0/2 | Not started | - |
| 2. Landing & Signup | 0/4 | Not started | - |
| 3. City Watch Room | 0/0 | Not started | - |
| 4. WhatsApp Sharing & Referral | 0/0 | Not started | - |
| 5. Competition Engine | 0/0 | Not started | - |
| 6. Squad Rooms | 0/0 | Not started | - |
| 7. Polish & Reactions | 0/0 | Not started | - |

## Coverage Validation

| Requirement | Phase |
|---|---|
| REQ-INFRA | 1 |
| REQ-LANDING | 2 |
| REQ-SIGNUP | 2 |
| REQ-INTERNATIONAL | 2 |
| REQ-CITY-ROOM | 3 |
| REQ-ROOM-SYNC | 3 |
| REQ-CHAT | 3 |
| REQ-PRESENCE | 3 |
| REQ-CONTENT-LIST | 3 |
| REQ-WHATSAPP-SHARE | 4 |
| REQ-REFERRAL | 4 |
| REQ-LEADERBOARD | 5 |
| REQ-LIVE-COUNTER | 5 |
| REQ-SQUAD-ROOM | 6 |
| REQ-REACTIONS | 7 |
| REQ-POLISH-MOBILE | 7 |

16 / 16 v1 requirements mapped. No orphans. No duplicates.
