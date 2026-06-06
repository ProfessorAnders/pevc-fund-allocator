# Deploy the PEVC Fund Allocator — Beginner's Guide

You'll use three free services: **GitHub** (stores your code), **Upstash** (the database), and **Vercel** (hosts the live site and the file storage). Total time: ~30–45 minutes the first time.

Work through the parts in order. Don't skip Part D before Part E.

---

## Part A — Install tools & create accounts (one-time)

1. **Install Node.js** (this gives you the `node` and `npm` commands).
   - Go to <https://nodejs.org> and download the **LTS** version. Run the installer, accept defaults.
2. **Install Git** (lets you send code to GitHub).
   - Go to <https://git-scm.com/downloads>, install for your OS, accept defaults.
3. **Install the GitHub CLI** (`gh`) — this makes pushing to GitHub painless.
   - Go to <https://cli.github.com>, install it.
4. **Create accounts** (free):
   - GitHub: <https://github.com> (Sign up)
   - Vercel: <https://vercel.com/signup> → choose **Continue with GitHub**
   - Upstash: <https://console.upstash.com> → sign in with GitHub or Google

**Check the tools installed.** Open a terminal:
   - **Mac:** open the **Terminal** app (Cmd+Space, type "Terminal").
   - **Windows:** open **PowerShell** (Start menu, type "PowerShell").

Type each and press Enter — you should see version numbers, not errors:
```bash
node -v
npm -v
git -v
gh --version
```

---

## Part B — Open the project in your terminal

1. **Unzip** `pevc-fund-allocator.zip`. You'll get a folder called `pevc-fund-allocator`.
   - Inside it you should see `package.json`, an `app` folder, a `lib` folder, etc. **`package.json` must sit at the top of this folder** (not inside another subfolder). This matters later.
2. **Move into that folder in the terminal.** The easy trick:
   - Type `cd ` (with a space), then **drag the `pevc-fund-allocator` folder from your file explorer into the terminal window**, then press Enter.
   - It should look like `cd /Users/you/Downloads/pevc-fund-allocator` (Mac) or `cd C:\Users\you\Downloads\pevc-fund-allocator` (Windows).
3. **Confirm you're in the right place:**
   ```bash
   ls          # Mac/Linux  — you should see package.json listed
   dir         # Windows    — you should see package.json listed
   ```

> **Optional but recommended — test it builds locally.** This catches errors before deploying.
> You need the database first, so do this *after* Part D if you want. Then:
> ```bash
> npm install
> cp .env.local.example .env.local   # Mac/Linux  (Windows: copy .env.local.example .env.local)
> # open .env.local in a text editor and paste your Upstash values (see Part D)
> npm run build                      # should end with "Compiled successfully"
> npm run dev                        # open http://localhost:3000
> ```

---

## Part C — Put the code on GitHub

In the same terminal, still inside the project folder:

1. **Log in to GitHub from the terminal** (opens your browser to confirm):
   ```bash
   gh auth login
   ```
   Choose: **GitHub.com** → **HTTPS** → **Login with a web browser**. Copy the code shown, press Enter, paste it in the browser, click **Authorize**.

2. **Turn the folder into a git repository and save a first snapshot:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
   (If git asks you to set your name/email the first time, run the two `git config --global` lines it suggests, then re-run the `git commit` line.)

3. **Create the GitHub repo and upload in one command:**
   ```bash
   gh repo create pevc-fund-allocator --private --source=. --push
   ```
   This creates a private repo named `pevc-fund-allocator` and pushes your code. Done — your code is on GitHub.

> **No GitHub CLI?** Alternative: go to <https://github.com/new>, create an empty repo named `pevc-fund-allocator` (don't add a README), then run the commands GitHub shows under "…or push an existing repository", which look like:
> ```bash
> git remote add origin https://github.com/YOURNAME/pevc-fund-allocator.git
> git branch -M main
> git push -u origin main
> ```

---

## Part D — Set up the database (Upstash Redis)

1. Go to <https://console.upstash.com>.
2. Click **Create Database** (choose **Redis** if asked).
   - Name: anything (e.g. `pevc`). Region: pick one near you (e.g. EU/London). Click **Create**.
3. On the database page, find the **REST API** section. You'll see two values (with copy buttons):
   - `UPSTASH_REDIS_REST_URL`  → this is your **URL**
   - `UPSTASH_REDIS_REST_TOKEN` → this is your **token**
4. **Keep this tab open** — you'll paste these into Vercel in the next part.

> The app expects these under the names `KV_REST_API_URL` and `KV_REST_API_TOKEN`. You'll rename them when you paste into Vercel (Part E). The *values* come from Upstash; the *names* must be exactly those.

---

## Part E — Deploy on Vercel & add the database keys

1. Go to <https://vercel.com> and log in (with GitHub).
2. Click **Add New… → Project**.
3. Find `pevc-fund-allocator` in your repo list and click **Import**.
   - If you don't see it: click **Adjust GitHub App Permissions** / **Configure** and give Vercel access to the repo, then come back.
4. On the configure screen, Vercel auto-detects **Next.js** — leave the build settings as-is.
   - **Root Directory:** should be `./`. (Only change it if your `package.json` ended up inside a subfolder — then set Root Directory to that subfolder.)
5. Expand **Environment Variables** and add these two (Name on the left, paste Value on the right):

   | Name | Value |
   |------|-------|
   | `KV_REST_API_URL` | the Upstash **URL** from Part D |
   | `KV_REST_API_TOKEN` | the Upstash **token** from Part D |

   Type the names **exactly** as shown (all caps, underscores).
6. Click **Deploy**. Wait ~1 minute for "Congratulations".
7. Click the preview to open your live site. You now have a public URL like `https://pevc-fund-allocator-xxxx.vercel.app`.

At this point registration and allocation work, but **PDF uploads won't yet** — that's the next part.

---

## Part F — Add file storage (Vercel Blob) for the PDFs

1. In your Vercel project, click the **Storage** tab.
2. Click **Create Database** → choose **Blob** → **Continue**.
3. **Set access to `Public`.** (Important — the app serves PDF links directly, so it must be a *Public* store.)
4. Name it (e.g. `fund-pdfs`) → **Create a new Blob store**.
5. When asked which **environments** to add the token to, select **all** (Production, Preview, Development) → confirm.
   - Vercel automatically adds an environment variable called `BLOB_READ_WRITE_TOKEN` to your project. You don't type it yourself.
6. **Redeploy so the new token takes effect:** go to the **Deployments** tab → open the latest deployment → the **⋯** menu → **Redeploy** → confirm.

When the redeploy finishes, uploads work end-to-end.

---

## Part G — Try it live & set up for class

1. Open your site URL, go to **`/admin`** (e.g. `https://your-site.vercel.app/admin`). Password: **`pevc2026`**.
2. Click **Open Uploads →**. (Optionally set **Capital per LP**.)
3. Open the main site `/` on your phone, register, and **pitch a test fund** (any small PDF). It should appear in **Browse**.
4. In admin, click **Open Uploads →** again to close uploads, then **Open Submissions →**.
5. Allocate on the phone and submit. Back in admin, click **Reveal Results →** and open **`/results`**.
6. When the test works, use admin **Reset all data** to clear everything before the real session.

**Change the admin password** (recommended — the default is public knowledge):
1. Open `app/admin/page.tsx` in a text editor, find the line `const ADMIN_PASSWORD = 'pevc2026';`, change it.
2. Save, then in the terminal:
   ```bash
   git add .
   git commit -m "Change admin password"
   git push
   ```
   Every push auto-redeploys on Vercel within a minute. (This is how you ship *any* future change.)

---

## Quick troubleshooting

- **Vercel build failed.** Open the failed deployment → read the red error in the build log. Most common: a missing/misspelled env var name (must be exactly `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- **Site loads but registering/allocating errors out.** The Upstash keys are wrong or missing. Re-check them in **Settings → Environment Variables**, fix, then redeploy.
- **PDF upload fails.** Make sure the Blob store exists, is **Public**, and you **redeployed** after creating it.
- **Vercel can't see the repo.** Settings → GitHub app → give it access to `pevc-fund-allocator`.
- **`gh: command not found`.** The GitHub CLI didn't install / terminal wasn't restarted. Reopen the terminal, or use the manual git push in Part C.

That's it — you're live. 🎉
