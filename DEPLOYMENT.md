# Deploying MathVision Materials

End-to-end checklist to get the portal live on **Supabase** (database, auth,
storage) + **Vercel** (the Next.js app). Budget ~20 minutes.

You'll need:

- A Supabase project (free tier is fine to start).
- A Vercel account connected to this Git repo.

---

## 1. Create the Supabase project

1. https://supabase.com/dashboard → **New project**. Pick a region close to your
   users and save the database password.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret** key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

---

## 2. Apply the database schema

This creates the tables, helper functions, the `eff_teacher_only` triggers, all
RLS policies, and the private `course-materials` storage bucket.

**Option A — SQL editor (simplest):**
Open **SQL Editor → New query**, paste the entire contents of
[`supabase/schema.sql`](./supabase/schema.sql), and **Run**.

**Option B — Supabase CLI:**
```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/* in order
```

Verify: **Table editor** shows `profiles`, `courses`, `course_memberships`,
`enrollment_requests`, `folders`, `files`, `question_topics`, `questions`,
`question_boxes`; **Storage** shows a private `course-materials` bucket.

**Already deployed before accounts & enrollment existed?** Run just that
migration —
[`supabase/migrations/20260612000006_accounts_enrollment.sql`](./supabase/migrations/20260612000006_accounts_enrollment.sql)
— in the SQL editor. It's idempotent and backfills every existing profile as
`approved`.

**Already deployed before the worksheet maker?** Run just
[`supabase/migrations/20261017000009_questions.sql`](./supabase/migrations/20261017000009_questions.sql)
— paste it into the SQL editor. It adds the three question tables, their
policies, `save_crops` and the `question_sources` view, changes no existing
table, and can be run twice. Apply it **before** deploying app code that reads
it: Vercel deploys the app, never the database. Then add each bank-holding
course's topics (step 8).

> **Not `supabase db push` on a project set up by pasting.** Pasting SQL into
> the editor (Option A, or the accounts migration above) records nothing in the
> project's migration history, so a push replays every migration file first.
> They all re-run cleanly, but `20260612000006` ends in
> `update public.profiles set status = 'approved' where status = 'pending'`:
> every signup waiting for approval is approved, with no error. Push only when
> `supabase migration list` shows `20260611000001` to `20260612000008` as
> applied on the remote. To get there from a pasted project, run
> `supabase migration repair --status applied 20260611000001 20260611000002 20260611000003 20260611000004 20260611000005 20260612000006 20260612000007 20260612000008`
> first.

To check a migration locally first: `PGHOST=localhost PGUSER=postgres bash
supabase/tests/run.sh` applies every migration to a scratch Postgres 16 and
runs the SQL tests.

---

## 3. Configure Auth

**Authentication → URL Configuration:**
- **Site URL:** your app's public URL (e.g. `https://materials.yourteam.vercel.app`).
  For local dev use `http://localhost:3000`.
- **Redirect URLs:** add both
  - `https://<your-app>/auth/callback`
  - `http://localhost:3000/auth/callback`

**Authentication → Providers → Email:** keep **Email** enabled, and keep
**"Allow new users to sign up" ON** — the portal has a self-signup flow where
people register as a student or teacher and then wait for an admin to approve
the account. (Admin invites skip the approval queue.) If "Confirm email" is on
— the default — signups verify their address before they can sign in.

**Email delivery (for invites & magic links):** Supabase's built-in email works
for testing but is heavily rate-limited. For production, set up custom SMTP under
**Authentication → Emails → SMTP Settings** (e.g. Resend, Postmark, SES).

> Resumable uploads use Supabase Storage's TUS endpoint
> (`/storage/v1/upload/resumable`), which is enabled by default — nothing to
> configure.

---

## 4. Bootstrap the first admin

The roster is standalone and the `handle_new_user` trigger creates a `profiles`
row (role `member`) for everyone who signs in. Promote yourself to admin once:

1. Sign in once so your auth user + profile exist. Either:
   - **Self sign-up** at `/login` → "Email me a sign-in link" (if sign-ups are
     still enabled), or
   - **Dashboard → Authentication → Users → Add user** (set a password).
2. In the **SQL editor**, run (use your email):
   ```sql
   update public.profiles set app_role = 'admin'
   where email = 'you@mathvision.com';
   ```
3. Reload the app — the **Admin console** now appears in the sidebar. From there
   you invite everyone else and assign per-course roles; no more SQL needed.

---

## 5. Deploy to Vercel

1. **Vercel → Add New → Project** → import this repo. Framework preset: **Next.js**
   (auto-detected). No build settings to change.
2. **Settings → Environment Variables** — add these for Production (and Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role key (secret) |
   | `NEXT_PUBLIC_SITE_URL` | your deployed URL, e.g. `https://<app>.vercel.app` |
   | `CRON_SECRET` | a long random string — `openssl rand -hex 32` |

3. **Deploy.** After the first deploy, copy the real production URL back into
   **`NEXT_PUBLIC_SITE_URL`** (and into Supabase **Site URL / Redirect URLs** from
   step 3) if it differs, then redeploy.

That's it — the app is live. Sign in as the admin, create a course, invite
people, and start uploading.

---

## 6. The 30-day purge

Soft-deleted items are physically removed after 30 days. Two interchangeable
schedulers ship with the app — **use one**.

### Option A — Vercel Cron (default, zero extra setup)

`vercel.json` already registers a daily cron hitting `/api/cron/purge` at 04:00
UTC. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`, which the
route verifies. As long as `CRON_SECRET` is set (step 5), it just works.

> Vercel Cron runs on Hobby/Pro; on Hobby it fires roughly daily. To test
> manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/purge`.

### Option B — Supabase Edge Function + pg_cron

If you'd rather keep it entirely in Supabase, deploy the Edge Function and
schedule it:

```bash
supabase functions deploy purge
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Then in the SQL editor (enable the extensions first under **Database →
Extensions**: `pg_cron`, `pg_net`):

```sql
select cron.schedule(
  'purge-materials-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/purge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || '<service-role-key>',
      'Content-Type',  'application/json'
    )
  );
  $$
);
```

If you use Option B, delete the `crons` block in `vercel.json` so the job doesn't
run twice (harmless, but tidy).

---

## 7. Google Drive import (optional)

Lets in-charges pick PDFs straight from Google Drive (native Picker popup).
The "Import from Google Drive" menu item stays hidden until both env vars exist.

1. **Google Cloud Console → create a project** (or reuse one).
2. **APIs & Services → Library:** enable **Google Picker API** and
   **Google Drive API**.
3. **APIs & Services → OAuth consent screen:** User type **External**, fill in
   app name + support email. Scope needed: `…/auth/drive.file` (non-sensitive —
   no Google verification required). **Publish** the app (or add your teachers
   as test users while trying it out).
4. **Credentials → Create credentials → OAuth client ID:** type **Web
   application**. Add your origins under **Authorized JavaScript origins**:
   `https://<your-domain>` and `http://localhost:3000`. No redirect URIs needed
   (token flow runs in a popup).
5. **Credentials → Create credentials → API key.** Restrict it: **Websites** →
   same origins; **APIs** → Google Picker API.
6. Add to Vercel env (and `.env.local`), then redeploy:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | the OAuth client ID (`…apps.googleusercontent.com`) |
   | `NEXT_PUBLIC_GOOGLE_API_KEY` | the API key |

The app uses the `drive.file` scope, so it can only ever read files the user
explicitly picks — it never sees the rest of their Drive. Downloads happen in
the browser and then go through the normal upload pipeline (progress, resumable
chunks, cancel).

---

## 8. Question topics (worksheet maker)

Each bank-holding course has one fixed topic list, in the owner's order. There
is no topic screen and the migration adds none, so re-running it never brings a
deleted topic back. Once the course exists, run this in the SQL editor with its
code and the owner's list:

```sql
insert into public.question_topics (course_id, name, position)
select c.id, t.name, t.position
from public.courses c,
     (values ('Fractions', 1), ('Decimals', 2), ('Percentages', 3)) as t(name, position)
where c.code = 'IM2'   -- or c.id = '<course id>' for a course with no code
on conflict (course_id, name) do update set position = excluded.position
returning name, position;
```

- The result lists the topics written. **An empty result means the code
  matched no course.**
- Each name appears once in the list; a name listed twice fails the whole
  statement with "cannot affect row a second time", and nothing is written.
- Running it again with the same list changes nothing; a reordered list moves
  the topics.
- A renamed topic would be added as a new one. Rename it in place instead:
  `update public.question_topics set name = '…' where id = '…';`
- Deleting a topic (`delete from public.question_topics where id = '…';`) keeps
  its questions and leaves them with no topic.

---

## Troubleshooting

- **Invite emails don't arrive.** You're hitting Supabase's built-in email limits
  — configure custom SMTP (step 3).
- **Redirected to `/login` in a loop.** `NEXT_PUBLIC_SITE_URL` and the Supabase
  **Redirect URLs** must include `/auth/callback` on the exact deployed origin.
- **Upload fails with 403.** Only `in_charge`/`admin` can upload; confirm your
  per-course role. Storage policies derive the course from the object path
  `courses/{course_id}/{file_id}.pdf`.
- **A student can't see a file you expect.** Check the item (or an ancestor
  folder) isn't marked teacher-only — the butter-yellow highlight flags it.
- **A bank says "This site's PDF reader is incomplete".** pdf.js's wasm, fonts,
  CMaps and ICC profiles are copied into `public/pdfjs/` by the `postinstall`
  script (`scripts/copy-pdfjs-assets.mjs`), and are not in git. An install run
  with `--ignore-scripts` skips it; redeploy with a plain `npm install`. The
  same card shows when the files are there but the browser cannot fetch
  `/pdfjs/wasm/`, for example through a school filter or proxy that blocks
  `.wasm` files. Without them a scanned page would draw blank, so the page view
  refuses to open a bank until they can be fetched.
```
