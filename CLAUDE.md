# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build (also catches TypeScript errors)
npm run start    # serve production build
```

No test suite or linter is configured. Use `npm run build` to catch type errors before committing.

## Environment

Requires `.env.local` (copy from `.env.local.example`):

```
KV_REST_API_URL=https://your-db.upstash.io   # Upstash Redis REST URL
KV_REST_API_TOKEN=your-token-here            # Upstash Redis REST token
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx     # Vercel Blob store token
```

`KV_*` come from the [Upstash](https://upstash.com) Redis console and must be set manually in Vercel env vars. `BLOB_READ_WRITE_TOKEN` is injected automatically once you create a Vercel Blob store (Storage tab); for local dev run `vercel env pull .env.local`.

## Architecture

Next.js 14 App Router app. All pages are `'use client'` components that call their own API routes. There is no server-side rendering of page content.

### Data flow

```
Browser page  →  /api/*               →  lib/kv.ts  →  Upstash Redis  (metadata)
Browser page  →  @vercel/blob/client  →  Vercel Blob                 (pitch PDFs)
```

`lib/kv.ts` is the single Redis data-access layer; keys are namespaced under `pevc:*`. Pitch PDFs upload **directly from the browser to Vercel Blob** (client uploads, bypassing the 4.5 MB serverless body limit); Redis stores only the resulting `pdfUrl`.

### Pages

| Route | File | Who uses it |
|---|---|---|
| `/` | `app/page.tsx` | Students — register, pitch a fund (My Fund tab), browse fund PDFs (Browse tab), allocate + submit (Allocate tab) |
| `/admin` | `app/admin/page.tsx` | Instructor — moderate student funds (review/delete), set per-LP capital budget, uploads gate + submissions gate, view submissions, manage LP profiles, reveal results |
| `/results` | `app/results/page.tsx` | Class — animated leaderboard |

### API routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/funds` | GET, POST | List funds / student creates their one fund (`{name, description, studentId, studentName, pdfUrl}`; blocked when `uploadsOpen` false; 409 if they already have one) |
| `/api/funds/[id]` | PUT, DELETE | Owner edits/replaces (PUT, `studentId` must match owner) or owner/admin deletes; deletes the old Blob PDF on replace/delete |
| `/api/funds/upload` | POST | Issues a Vercel Blob client-upload token (`handleUpload`); enforces uploads gate, `application/pdf` only, one-per-student |
| `/api/funds/[id]/logo` | GET, POST | Legacy, unused (logos replaced by PDFs) |
| `/api/allocations` | GET, POST | List all / submit a student allocation (POST blocked when `submissionsOpen` is false) |
| `/api/students` | GET, DELETE | List LP profiles / delete one (`{fingerprint, studentId}`) or all (`{clearAll:true}`); also removes that LP fund(s) + Blob PDF(s) |
| `/api/students/[studentId]/validate` | GET | Returns `{valid: boolean}` — used by student page to detect session invalidation |
| `/api/state` | GET, PUT | Read / write `resultsVisible`, `submissionsOpen`, `uploadsOpen`, and `capitalBudget` |
| `/api/register` | POST | Register a new student (fingerprint dedup) |
| `/api/reset` | DELETE | Wipe all `pevc:*` keys and purge all Blob PDFs under `fund-pdfs/` |

### Redis key scheme (`lib/kv.ts`)

| Key | Type | Notes |
|---|---|---|
| `pevc:funds` | `Fund[]` | Ordered array; each `Fund` carries `ownerStudentId`, `ownerName`, `pdfUrl`, `pdfName` |
| `pevc:student_ids` | `string[]` | IDs of students who have submitted |
| `pevc:allocation:{studentId}` | `StudentAllocation` | One record per submission |
| `pevc:fingerprint:{fp}` | `{studentId, studentName}` | Written on registration; prevents re-registration |
| `pevc:student:{studentId}` | `true` | Written on registration; O(1) existence check for `/validate` |
| `pevc:logo:{fundId}` | `string` | Legacy, unused |
| `pevc:uploads_open` | `boolean` | Gates fund uploads; enforced in `POST /api/funds` and `/api/funds/upload` |
| `pevc:submissions_open` | `boolean` | Gates allocation submit; enforced in `POST /api/allocations` |
| `pevc:capital_budget` | `number` | Per-LP budget in $M (default 100); enforced in `POST /api/allocations` |
| `pevc:results_visible` | `boolean` | Controls whether `/results` shows data |

### Anti-duplicate registration

`@fingerprintjs/fingerprintjs` runs client-side on the landing page and generates a `visitorId`. This is sent to `/api/register`, which checks `pevc:fingerprint:{visitorId}` before creating a new student. Registration also writes `pevc:student:{studentId}` = true. Deleting a student via `/api/students` removes both keys, allowing re-registration from that device.

### Session invalidation

The student page polls `/api/students/{studentId}/validate` every 5 seconds while in the main app view. If the admin deletes a student, the endpoint returns `{valid: false}`, localStorage is cleared, and the student is shown a "Session Reset" screen with a "Create New Profile" button. The validate endpoint fails open (returns `{valid: true}` on error) to avoid kicking students on transient Redis failures.

### Submissions gate

`pevc:submissions_open` (default `false`) controls whether students can submit. The admin toggles it via the "Submissions Gate" tile in the admin panel. The gate is enforced server-side in `POST /api/allocations` — clients receive a 403 if they try to submit while closed. The student page also polls for this flag every 5 seconds alongside the funds refresh and disables the Submit button client-side when closed.

### Polling intervals

All client-side polling runs at **5-second intervals**:
- Student page: funds + `submissionsOpen` state (allocation view only); session validation (allocation + submitted views)
- Admin page: full data refresh (funds, allocations, state, students)
- Results page: `resultsVisible` state

### Admin auth

Password is hardcoded as `ADMIN_PASSWORD = 'pevc2026'` in `app/admin/page.tsx` and checked client-side only. Change it there to rotate.

### Logo upload flow

Logos are compressed client-side in `app/admin/page.tsx` (`compressImage`) to ≤400px JPEG at quality 0.82 before being sent as a base64 data URI to `/api/funds/[id]/logo`. The route stores the raw data URI in Redis and serves it back as binary with `Content-Type` and a 1-hour cache header.
