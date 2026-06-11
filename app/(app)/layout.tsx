import { requireProfile } from "@/lib/auth";
import { getMyCourses } from "@/lib/queries";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const courses = await getMyCourses(profile.app_role === "admin");

  return (
    <ToastProvider>
      <AppShell profile={profile} courses={courses}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
