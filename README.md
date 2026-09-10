# ccusage Viewer

Local Next.js site to visualize `npx ccusage *` data.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick Daily / Weekly / Monthly / Session / Blocks, optionally set Since / Until, press **Scan**.

## How it works

- `GET /api/scan?view=daily&since=2026-01-01&until=2026-09-10` spawns `npx ccusage <view> --json` on this Mac and returns `{rows, totals, scannedAt}`.
- Only `daily|weekly|monthly|session|blocks` allowed. Local dev only — do not deploy without auth since the API executes commands.
