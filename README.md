# PEVC Fund Allocator

A full-stack web app for university PE/VC seminars. ~50 students each allocate $100M in fictional capital across private equity funds, then the class sees a live leaderboard.

## Features

- **Student flow** — enter name → **pitch your own fund** (one PDF + description, one per LP) → **browse and read every other fund's PDF** → allocate the capital budget across the field (you can't allocate to your own fund) → submit when the instructor opens submissions → one submission per device
- **Admin panel** (`/admin`) — moderate student-pitched funds (review PDFs, delete), manage LP profiles, open/close the **uploads gate** and **submissions gate** independently, watch live submissions (5s refresh), reveal results
- **Results page** (`/results`) — animated leaderboard, projector-friendly, auto-reveals when admin clicks the button

Funds are now created by students, not the admin: each LP uploads one pitch PDF (stored in **Vercel Blob**), and everyone allocates across the resulting set.

## Repo structure

```
pevc-fund-allocator/        ← git repo root
└── pevc-fund-allocator/    ← Next.js app (run all commands from here)
    ├── app/
    ├── lib/
    ├── package.json
    └── ...
```

All `npm` commands and the `vercel` CLI must be run from the inner `pevc-fund-allocator/` directory.

## Setup

### 1. Install dependencies

```bash
cd pevc-fund-allocator
npm install
```

### 2. Set up Upstash Redis

1. Create a free database at [upstash.com](https://upstash.com) (choose **Redis**, any region)
2. In the database dashboard, copy **REST URL** and **REST Token**
3. Copy the env file and fill in those values:

```bash
cp .env.local.example .env.local
```

`.env.local`:
```
KV_REST_API_URL=https://your-db.upstash.io
KV_REST_API_TOKEN=your-token-here
```

### 2b. Set up Vercel Blob (fund PDFs)

Pitch PDFs are uploaded straight from the browser to Vercel Blob, so Redis only
ever stores the PDF's URL (never the file itself).

1. In your Vercel project, open **Storage → Create → Blob** and create a store.
2. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically in deployments.
3. For local dev, pull it into `.env.local`:

```bash
vercel env pull .env.local
```

(or paste a Read/Write token as `BLOB_READ_WRITE_TOKEN` manually).

### 3. Run locally

```bash
npm run dev
# open http://localhost:3000
```

### 4. Deploy to Vercel

```bash
npm install -g vercel   # if not already installed
vercel --prod
```

After deploying, set `KV_REST_API_URL` and `KV_REST_API_TOKEN` as **Environment Variables** in your Vercel project (Settings → Environment Variables) from your Upstash dashboard. Creating the Blob store adds `BLOB_READ_WRITE_TOKEN` for you. Then redeploy so the variables take effect.

## Usage

### Before the lecture

1. Open `/admin` (password: `pevc2026`)
2. Click **Open Uploads →** so students can start pitching funds
3. Test the student flow on your phone

### During the lecture

1. Show a QR code to your `/` page — students scan, register, and **pitch their fund** (name + description + one PDF)
2. Once enough funds are in, click **Open Uploads →** again to **close** uploads and freeze the fund list
3. Students review every fund's PDF in the **Browse** tab
4. The Submit button stays disabled until you click **Open Submissions →**
5. When ready for students to lock in their allocations, click **Open Submissions →**
6. Watch submissions arrive in real time in the admin panel
7. When ready, click **Reveal Results →** — the leaderboard goes live at `/results`
8. Put `/results` on the projector

> The **uploads gate** and **submissions gate** are independent, so you can run "pitch funds" and "allocate capital" as two distinct phases.

### Student management

The **LP Profiles** section in the admin panel lists every registered student (name, device ID, submitted/pending status). You can:
- **Remove** an individual student — clears their fingerprint, allocation, **and their pitched fund (plus its PDF in Blob)**, letting them re-register
- **Clear all students** — removes all profiles, allocations, **and all funds + their PDFs** (every fund belongs to a student in this model)

Removed students see a "Session Reset" screen within 5 seconds and can re-register immediately.

### Admin password

Hardcoded as `pevc2026`. Change `ADMIN_PASSWORD` in `app/admin/page.tsx` to rotate it.

## Tech Stack

- [Next.js 14](https://nextjs.org) (App Router)
- [Tailwind CSS](https://tailwindcss.com)
- [Upstash Redis](https://upstash.com) (via `@upstash/redis`) — metadata
- [Vercel Blob](https://vercel.com/docs/vercel-blob) (via `@vercel/blob`) — pitch PDFs
- TypeScript

## Data model (Redis keys)

| Key | Value |
|-----|-------|
| `pevc:funds` | `Fund[]` — each fund has `ownerStudentId`, `ownerName`, `pdfUrl`, `pdfName` |
| `pevc:student_ids` | `string[]` |
| `pevc:allocation:{studentId}` | `StudentAllocation` |
| `pevc:fingerprint:{fingerprint}` | `{ studentId, studentName }` |
| `pevc:student:{studentId}` | `true` — existence check for session validation |
| `pevc:uploads_open` | `boolean` — fund-upload gate |
| `pevc:submissions_open` | `boolean` — allocation-submit gate |
| `pevc:results_visible` | `boolean` |
| `pevc:logo:{fundId}` | _legacy, unused_ — logos were replaced by PDFs |

PDFs themselves live in **Vercel Blob** under the `fund-pdfs/` prefix; `pevc:funds[].pdfUrl` points to them.
