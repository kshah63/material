import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: courses }, { data: memberships }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("courses").select("*").order("created_at", { ascending: true }),
      supabase.from("course_memberships").select("id, course_id, user_id, role"),
    ]);

  return (
    <AdminConsole
      profiles={profiles ?? []}
      courses={courses ?? []}
      memberships={memberships ?? []}
    />
  );
}
