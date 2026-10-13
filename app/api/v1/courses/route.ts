import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiError, authorizeApiRequest } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/courses — every course, non-archived first. Lets the lessons
 * platform map its own courses onto material courses by id or code.
 */
export async function GET(request: Request) {
  const auth = authorizeApiRequest(request);
  if (!auth.ok) return auth.response;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("courses")
    .select("id, name, code, archived_at")
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });
  if (error) return apiError(500, error.message);

  return NextResponse.json({
    courses: (data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      code: (c.code as string | null) ?? null,
      archived: c.archived_at !== null,
    })),
  });
}
