# Phase 02 — Plan 04 SMOKE

End-to-end evidence for the landing → signup → room funnel.

## Bundle Audit (Plan 04 Task 2)

Built at: 2026-04-27T06:43:10Z
Build command: `npm run build` (Next.js 15.5.15, Turbopack)
Build log path: /tmp/build.log
Build exit code: 0

### Raw Build Output (verbatim, routes table)

```
Route (app)                         Size  First Load JS
┌ ƒ /                             3.6 kB         118 kB
├ ○ /_not-found                      0 B         115 kB
├ ƒ /room/[id]                       0 B         115 kB
└ ƒ /signup                      1.25 kB         116 kB
+ First Load JS shared by all     119 kB
  ├ chunks/0d379cb6c2147f9c.js   17.2 kB
  ├ chunks/5d92bec654c117a5.js   11.9 kB
  ├ chunks/931112685eb8e7de.js   59.2 kB
  ├ chunks/ca38eecc598ce8e7.js   12.8 kB
  └ other shared chunks (total)  17.9 kB

ƒ Middleware                     42.9 kB
```

### Verdict against renegotiated budget

| Route       | Size    | First Load JS | Original budget | Renegotiated budget                 | Verdict |
| ----------- | ------- | ------------- | --------------- | ----------------------------------- | ------- |
| /           | 3.6 kB  | 118 kB        | 100 KB          | ≤ 120 KB shared + ≤ 5 KB per-route  | PASS    |
| /signup     | 1.25 kB | 116 kB        | 100 KB          | ≤ 120 KB shared + ≤ 5 KB per-route  | PASS    |
| /room/[id]  | 0 B     | 115 kB        | n/a             | informational                       | n/a     |
| (shared)    | —       | 119 kB        | n/a             | ≤ 120 KB                            | PASS    |

- Shared baseline: 119 kB ≤ 120 kB → PASS
- `/` per-route delta: 3.6 kB ≤ 5 kB → PASS
- `/signup` per-route delta: 1.25 kB ≤ 5 kB → PASS

### Deviation note (user-approved 2026-04-27)

The original REQ-LANDING gate of "≤ 100 KB First Load JS for `/`" was renegotiated
mid-execution after an initial HARD FAIL at 118 kB. Top contributing chunk is
`chunks/931112685eb8e7de.js` at 59.2 kB — the React + Next.js 15 App Router runtime
baseline. Removing this is not feasible without abandoning App Router server actions
(the foundation of the signup flow). All Phase 2 client code combined adds only ~4 kB
on top of that runtime baseline (route-specific deltas are 1.25–3.6 kB).

User decision (2026-04-27): ACCEPT the renegotiated budget.
- New gate: ≤ 120 KB shared baseline + ≤ 5 KB per-route delta
- All current measurements satisfy both bounds
- REQ-LANDING in `.planning/REQUIREMENTS.md` was updated with the new budget and a
  2026-04-27 deviation note prior to this rebuild.

Bundle audit: **PASS** under the renegotiated budget. Proceeding to Task 3.

## End-to-End Smoke (Plan 04 Task 3)

Run at: <to be filled by Task 3>
Environment: local dev (`npm run dev`)

## Vercel Preview International Check (Plan 04 Task 3b)

<to be filled by Task 3b>
