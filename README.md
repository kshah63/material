# MathVision Materials Portal

A Drive-style document portal for course material — per-course roles, teacher-only
visibility with inheritance, bulk/resumable PDF uploads, and 30-day recoverable
deletes.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + Storage) · Vercel

> Setting it up on your own Supabase + Vercel? See **[DEPLOYMENT.md](./DEPLOYMENT.md)**
> for the end-to-end checklist.

---

## What it does

- **Courses** with a Drive-style folder tree of PDFs.
- **Two layers of authority**
  - Platform: `profiles.app_role` — `admin` (MV staff) or `member`.
  - Per-course: `course_memberships.role` — `student`, `teacher`, or `in_charge`.
    Roles live on the membership, so the same person can be `in_charge` of one
    course and a `student` in another.
- **Teacher-only visibility** as a folder default with per-file override,
  resolved per row and **enforced in the database** (RLS) — not just hidden in
  the UI.
- **Bulk & resumable uploads** — drop whole folders; large files resume on a
  dropped connection (TUS).
- **Soft delete → Trash → 30-day purge.** Nobody can hard-delete; the only
  physical delete is an automated service-role job.

### Permission matrix (per course)

| Action | student | teacher | in_charge | admin |
|---|:---:|:---:|:---:|:---:|
| View non-teacher-only material | ✓ | ✓ | ✓ | ✓ |
| View teacher-only material | — | ✓ | ✓ | ✓ |
| Upload / create / rename / move / delete | — | — | ✓ | ✓ |
| View Trash + restore | — | — | ✓ | ✓ |
| Manage members / courses / invites | — | — | — | ✓ |

---

## Architecture at a glance

| Concern | Where | Notes |
|---|---|---|
| Authorization | Postgres **RLS** (`supabase/migrations/*_rls.sql`) | The whole matrix lives in DB policies. Server actions just run queries under the caller's session. |
| Teacher-only inheritance | `eff_teacher_only` denormalized column + triggers | Resolved value stored per row so RLS reads a boolean. Recomputed only on flag-change / move. The trickiest piece — see `*_functions.sql` / `*_triggers.sql`. |
| Secure viewing | `getViewUrl()` server action | Selects the row under the caller's session (RLS authorizes), then mints a 60s **service-role signed URL**. Bucket is private; teacher-only PDFs never sit behind a guessable URL. |
| Uploads | `hooks/useUploader.ts` + `lib/upload/*` | Reconstructs the dropped folder tree, creates folders once, uploads bytes resumably (TUS, 4-wide pool), registers each `files` row only after its bytes commit. |
| Soft delete / restore | `soft_delete_*` / `restore_batch` RPCs | One `delete_batch_id` per operation so a folder + its contents restore as one unit. |
| Purge | `app/api/cron/purge` (Vercel Cron) or `supabase/functions/purge` (Edge) | Object first, then row. Service role only. |
| Read API | `app/api/v1/*` + `lib/api/auth.ts` | Server-to-server JSON for the lessons platform: shared key + stated acting role, service-role queries, role matrix applied in the handler. See § Read API. |

---

## Read API (server-to-server)

A small JSON API under `/api/v1` lets another trusted backend (the lessons
platform) list a course's material and open files **without a user session**.
Every route runs as the service role, so the caller is trusted to state the
acting user's course role, and the handlers apply the permission matrix
themselves. Read-only; Trash is never exposed.

**Headers** (every request):

| Header | Value |
|---|---|
| `Authorization` | `Bearer <MATERIALS_API_KEY>` — 401 if the env var is unset or the key doesn't match |
| `X-Acting-Role` | `student` · `teacher` · `in_charge` · `admin` (default `student`; anything else → 400) |
| `X-Acting-Email` | optional, informational only — not used for authorization |

**Role semantics** mirror RLS: `student` never sees teacher-only material
(`eff_teacher_only`, i.e. the inherited flag); every other role sees everything.

**Endpoints**

- `GET /api/v1/courses` → `{ courses: [{ id, name, code, archived }] }`,
  non-archived first.
- `GET /api/v1/courses/{courseId}/tree?role=student|teacher` →
  `{ course: { id, name, code }, root }` where
  `root = { id: null, name, folders: Folder[], files: File[] }`,
  `Folder = { id, name, folders, files }` and
  `File = { id, name, size_bytes, mime_type, teacher_only, created_at }`.
  `?role=` is an alias for `X-Acting-Role` (if both are sent they must agree).
  For `student`, a teacher-only folder is pruned together with everything
  beneath it. 404 for an unknown course.
- `POST /api/v1/files/{fileId}/view-url` → `{ url, name, expires_in: 60 }` —
  a 60-second signed URL for viewing, minted the same way as `getViewUrl()`
  (no download variant). 404 if the file is missing or in Trash; 403 if it is
  teacher-only and the acting role is `student`.

Errors are `{ error: string }` with the matching status. Responses are never
cached (`force-dynamic`, and `Cache-Control: no-store` on signed URLs).

`MATERIALS_API_KEY` is **server-to-server only**: it bypasses RLS, so it must
live only in the calling backend's environment — never in a browser or mobile
app. The proxy skips `/api/v1/*` entirely, so these routes never touch session
cookies or redirect to `/login`.

---

## Project structure

```
app/
  (app)/                  authed shell (sidebar) + screens
    courses/              course list + [courseId] browser + trash
    admin/                admin console (courses, people, invites)
  actions/                server actions = the API surface (§8)
  api/cron/purge/         30-day purge route (Vercel Cron)
  api/v1/                 server-to-server read API (lessons platform)
  auth/callback/          magic-link / invite landing
  login/                  auth screen
components/               UI: AppShell, browser/, upload/, admin/, ui/, icons/
hooks/useUploader.ts      bulk/resumable upload orchestration
lib/
  supabase/               server / client / service / proxy clients
  queries.ts              server-side reads (RLS-scoped)
  upload/                 folder-tree capture + TUS upload
supabase/
  migrations/             schema · functions · triggers · rls · storage
  schema.sql              all migrations concatenated (one-shot paste)
  functions/purge/        Edge Function alternative to the cron route
```

---

## Local development

1. Copy env and fill in your Supabase keys:
   ```bash
   cp .env.example .env.local
   ```
2. Apply the database schema to your Supabase project (SQL editor → paste
   `supabase/schema.sql`, or `supabase db push`). See DEPLOYMENT.md.
3. Run:
   ```bash
   npm install
   npm run dev
   ```
4. Open http://localhost:3000 — you'll be sent to `/login`.

The first user needs `app_role = 'admin'` to reach the console; see
DEPLOYMENT.md → "Bootstrap the first admin".

---

## Open decisions (v1 defaults)

These follow the spec's recommendations; each is a small change to revisit later:

- **Download allowed.** Signed URLs permit download. True view-only (DRM) is out
  of scope.
- **Keep-both naming.** Re-uploading a duplicate name appends ` (2)`.
- **PDF-only.** Enforced on upload and at the Storage bucket. Loosen by editing
  the mime filter in `lib/upload/tree.ts` and the bucket's `allowed_mime_types`.
- **No audit log / search yet.** Both are easy additive layers (`files.name`
  search; an append-only views table).
