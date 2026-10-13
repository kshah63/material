import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Auth for the server-to-server read API under /api/v1. There is no user
 * session here: the caller (the lessons platform) holds MATERIALS_API_KEY and
 * states which course role it is acting as. Handlers run as the service role
 * (which bypasses RLS) and apply the permission matrix themselves.
 */

export const ACTING_ROLES = ["student", "teacher", "in_charge", "admin"] as const;
export type ActingRole = (typeof ACTING_ROLES)[number];

export interface ApiCaller {
  role: ActingRole;
  /** From X-Acting-Email. Informational only — never used for authorization. */
  email: string | null;
}

export type ApiAuthResult =
  | { ok: true; caller: ApiCaller }
  | { ok: false; response: NextResponse };

/** JSON error body `{ error }` with the given status — the API's one error shape. */
export function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Mirrors RLS: only `student` is restricted; every other role sees teacher-only rows. */
export function canSeeTeacherOnly(role: ActingRole) {
  return role !== "student";
}

function isActingRole(value: string): value is ActingRole {
  return (ACTING_ROLES as readonly string[]).includes(value);
}

/** Constant-time compare. Hashing first means length differences don't leak either. */
function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Checks `Authorization: Bearer <MATERIALS_API_KEY>` and reads the acting role
 * from `X-Acting-Role` (default `student`). `roleFallback` lets a route also
 * accept the role from its query string (the tree endpoint's `?role=`); the
 * header wins, and the two must agree when both are present.
 *
 * On failure returns the response to send (401 / 400). The key is never
 * logged or echoed.
 */
export function authorizeApiRequest(
  request: Request,
  roleFallback: string | null = null,
): ApiAuthResult {
  const expected = process.env.MATERIALS_API_KEY;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !presented || !safeEqual(presented, expected)) {
    return { ok: false, response: apiError(401, "Unauthorized") };
  }

  const headerRole = request.headers.get("x-acting-role");
  if (headerRole !== null && roleFallback !== null && headerRole !== roleFallback) {
    return {
      ok: false,
      response: apiError(400, "X-Acting-Role and ?role= disagree."),
    };
  }
  const role = headerRole ?? roleFallback ?? "student";
  if (!isActingRole(role)) {
    return { ok: false, response: apiError(400, "Unknown X-Acting-Role.") };
  }

  const email = request.headers.get("x-acting-email")?.trim() || null;
  return { ok: true, caller: { role, email } };
}
