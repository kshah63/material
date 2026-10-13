import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 "proxy" convention (formerly middleware.ts). Keeps the Supabase
// session fresh and enforces auth on every rendered route.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, image files and the
     * server-to-server read API (/api/v1/*). The API authenticates with its
     * own bearer key and has no user session, so it must never be bounced to
     * /login or have session cookies touched.
     */
    "/((?!api/v1|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
