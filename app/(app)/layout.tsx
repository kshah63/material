import { requireProfile } from "@/lib/auth";
import { getMyCourses } from "@/lib/queries";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { signOut } from "@/app/actions/auth";
import { MarkerIcon } from "@/components/icons";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // Self-signups wait here until an admin approves them. (Admins are never
  // gated, and rows created before the approval feature default to approved.)
  if (profile.app_role !== "admin" && profile.status === "pending") {
    return (
      <main className="min-h-screen grid place-items-center" style={{ padding: 24 }}>
        <div className="card text-center rise" style={{ padding: "44px 36px", maxWidth: 440 }}>
          <div
            className="mx-auto grid place-items-center rounded-full mb-4"
            style={{ width: 56, height: 56, background: "var(--marker)" }}
          >
            <MarkerIcon width={26} height={26} style={{ color: "var(--marker-ink)" }} />
          </div>
          <h1 style={{ fontSize: 24 }}>You&apos;re almost in</h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 10 }}>
            Thanks for signing up{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
            Your {profile.account_role} account is waiting for an admin to approve
            it. Check back soon — once you&apos;re approved you can browse courses and
            request to join them.
          </p>
          <form action={signOut} className="mt-6">
            <button className="btn btn-ghost">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const courses = await getMyCourses(profile.app_role === "admin");
  // The directory policy also surfaces courses you could request to join; the
  // sidebar should only list ones you're actually in (or oversee as admin).
  const mine = courses.filter((c) => c.role || c.is_admin_view);

  return (
    <ToastProvider>
      <AppShell profile={profile} courses={mine}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
