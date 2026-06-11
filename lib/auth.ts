import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

/** Current auth user + profile, or redirect to /login. Use in protected pages. */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // The handle_new_user trigger creates the row on signup; if it's somehow
  // missing, fall back to a minimal shape rather than crashing the app.
  return (
    profile ?? {
      id: user.id,
      email: user.email ?? "",
      full_name: (user.user_metadata?.full_name as string) ?? null,
      app_role: "member" as const,
      created_at: new Date().toISOString(),
    }
  );
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.app_role !== "admin") redirect("/courses");
  return profile;
}
