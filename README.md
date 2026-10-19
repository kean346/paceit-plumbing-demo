# Flow Plumbing — Quotes workspace

A working Next.js + MongoDB portfolio application for **paceIT**. Flow Plumbing, its customers, jobs and prices are fictional. The app uses a real database; it does not save business records in localStorage or pretend to send messages.

## Start on your computer

You already have a Next.js folder and `.env.local`. If using the delivered source archive, extract it and copy its contents into your existing `paceit-plumbing-demo` folder, accepting replacements for source files. Keep your existing `.git` folder and `.env.local`. The archive contains neither credentials nor Git history.

Use Node.js 22 LTS or newer. In the project root:

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first load creates your browser's private demo workspace with 12 customers, 25 quotes and a service catalogue. You do not need to create collections or seed manually.

Your existing `.env.local` must contain:

```dotenv
MONGODB_URI="your Atlas Node.js driver connection string"
MONGODB_DB="paceit_plumbing_demo"
```

Do not replace your actual connection string with this placeholder. Do not commit `.env.local`. Only `.env.example` is tracked. Password characters such as `@`, `#`, `:` and `/` must be percent encoded in a connection URI. Keep these variables server-only, with no `NEXT_PUBLIC_` prefix.

In Atlas, allow your current development IP and confirm that your database user has `readWrite` on `paceit_plumbing_demo`. Transactions require an Atlas cluster or another MongoDB replica set; a standalone `mongod` is insufficient. If connection fails, check Network Access, database user credentials, the driver URI and whether the cluster is available. Restart `npm run dev` after editing `.env.local`.

## Try the demo

1. Open **Customers** and add a fictional customer with an `@example.com` address.
2. Open **Quotes → New quote**. Choose the customer, add a job title and line items, then save.
3. Refresh the browser. The quote should remain.
4. Open its detail view and use **Simulate sending**. No email or WhatsApp message is sent.
5. Set a follow-up date for today. The overview's due list should update.
6. Record simulated acceptance. Outstanding quote value decreases and accepted quote value increases.
7. Use **Print / PDF** for the dedicated quotation layout.
8. Duplicate a sent or accepted quote to start a revised draft. The original remains unchanged.
9. Open a private/incognito window to verify a separate demo workspace.

All buttons have implemented actions. Quote search, status filters, sort and pagination run over the current workspace's database-loaded records. The demo caps each workspace at 200 customers and 300 quotes; it is not intended for a production customer database.

## Implemented features

- Overview with quote value created this month, outstanding sent value, accepted quote value and due follow-ups. Archived quotes are excluded. Accepted value is all time. Quote value includes configured demo tax and is not collected revenue.
- Draft, sent, accepted, declined and expired quote states. Sent quotes become effectively expired when their validity date passes in South African time; this is derived on read, not a scheduled background job.
- Create/edit drafts, unique server-generated numbers, duplicate, archive/restore, customer/company snapshots, activity history and optimistic version checks.
- Customer creation, editing, search and per-customer quote history.
- Configurable company details, quote terms and demo tax. Existing quotes preserve their original snapshots.
- Quote follow-up dates and completion, with due/overdue lists. No automatic notifications.
- Browser print/save-as-PDF view with no application navigation in the print output.
- Responsive layouts, native modal focus handling, keyboard focus indicators and reduced-motion support.
- Loading, validation, connection-error and save-feedback states. A failed mutation preserves the editor's input.

## Brand implementation

Uses the supplied software-agency identity: Emerald Signal `#43B19B`, Limestone Grey `#EAEAE8`, Obsidian Carbon `#0F0F11`, Studio White `#FFFFFF`, Plus Jakarta Sans and Space Grotesk. Neutral surface variations and darker functional greens support readability. Fonts are bundled through Fontsource rather than fetched at runtime. The two endurance-brand slides were excluded as inconsistent with the agency brief. The visible builder credit uses the requested spelling **paceIT**.

21st.dev / React Bits were considered but not added. The workspace uses purpose-built layouts and Lucide icons; decorative animation was not needed for the quoting workflow. There are no unverified registry dependencies or copied third-party component snippets.

## Data and security model

- `workspaces`: server-issued token hash, immutable workspace ID, settings, quote counter and seven-day expiry.
- `customers`: workspace-scoped fictional records.
- `quotes`: integer money values, embedded lines, immutable customer/company snapshots, version, embedded activity and dates.
- `catalogue`: workspace-scoped illustrative services.
- `activity`: workspace-scoped event records, written in the same transaction as the mutation.
- `limits`: short-lived request counters with TTL cleanup.

A 256-bit random token is held in an HttpOnly, SameSite=Lax cookie. It is Secure on production HTTPS. Only its SHA-256 hash is stored. Every read and mutation resolves ownership from the cookie. Client-provided workspace IDs are not accepted. A lost/expired cookie starts another workspace; this is demo isolation, **not production staff authentication**.

Seed, reset and mutations use MongoDB transactions. A workspace revision serializes concurrent mutations, including reset. Atomic counters and a unique `(workspaceId, number)` index protect numbering. The request API validates input with Zod, checks same-origin mutations, limits JSON bodies to 64 KB after reading, and limits each workspace to 60 writes and 120 reads per minute. Session bootstrap is limited to 20 requests/minute by Vercel-provided IP; non-Vercel execution uses a shared bucket. Public production use would also need edge rate limits, authentication, monitoring and a stricter request streaming limit.

Money uses integer cents. Quantity allows two decimal places. Each line is rounded half up to the nearest cent, then the fixed discount is subtracted, then tax (integer basis points) is rounded half up once. Discounts cannot exceed subtotal. Tax is illustrative and does not establish VAT registration.

## Cleanup

Sessions expire after seven days and cannot read or mutate after expiry. Business records are not automatically deleted by a TTL on the workspace, because that would orphan related records. Run this explicit cleanup on a trusted machine with `.env.local` configured:

```bash
npm run db:cleanup
```

It deletes expired workspaces and their related records transactionally. Schedule this command daily through your chosen trusted scheduler before sharing the demo broadly. No scheduler has been deployed. The short-lived rate-limit collection cleans itself up with MongoDB TTL.

## Verification

```bash
npm run test:unit
npm test
npm run build
```

- `test:unit`: calculation/rounding, validation, expiry/metrics, origin rejection and unauthenticated-read checks.
- `npm test`: starts an isolated real MongoDB replica set with `mongodb-memory-server`, then exercises seed-once, create/edit persistence, snapshots, concurrent numbering, status transitions/metrics, follow-ups, cross-session access, reset isolation and session expiry. It never reads your Atlas credentials or modifies your Atlas database. First run downloads a MongoDB binary; the host must permit local database processes.
- `build`: production compilation, TypeScript checks and page generation.

### Verification performed for this delivery

Production build: **passed**. Unit/API guard checks: **11 passed**. The integration test suite was attempted, but this execution host refused MongoDB startup with `open: Operation not permitted` before the database assertions could run. Live Atlas persistence, numbering under load, cross-session isolation and reset isolation therefore remain **unverified**. The complete integration suite is included for your local execution. Browser visual, mobile interaction and print-preview QA were not available here; verify those before using the demo in a sales presentation. This project has **not been deployed**.

## GitHub

Once the source is in your local checkout:

```bash
git status
git add src scripts tests README.md package.json package-lock.json next.config.ts .gitignore .env.example
git commit -m "Build Flow Plumbing quotation workspace"
git push
```

Check that `.env.local` is absent from the staged file list. If this build is delivered through a separate branch later, pull that branch instead of copying the archive.

## Vercel

1. In Vercel, import `kean346/paceit-plumbing-demo` from GitHub.
2. Use the Next.js framework preset and project root. Build command: `npm run build`. Use a Node.js runtime compatible with the project's dependencies (Node 22+).
3. Add `MONGODB_URI` and `MONGODB_DB` as server environment variables for the environments you intend to deploy. Prefer separate demo databases for Preview and Production.
4. Configure Atlas network access for the actual deployment egress. Do not assume the development IP permits Vercel access. Prefer fixed outbound IP/network integration when available. A broad IP allowlist exposes the database endpoint to more networks and should not be used as a silent default.
5. Deploy over HTTPS, then complete the smoke test above in two browser sessions. Redeploy after changing environment variables.

No Firebase, email provider or WhatsApp integration is needed. Deployment has not been performed and no live URL is claimed.

Official references:

- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/environment-variables
- https://www.mongodb.com/docs/atlas/connect-to-database-deployment/
- https://www.mongodb.com/docs/manual/reference/connection-string/
