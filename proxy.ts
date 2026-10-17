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
     * Match all request paths except static assets and image files. Keeps the
     * session fresh and enforces auth on everything that renders the app.
     * public/pdfjs/ (pdf.js's wasm, cmaps, fonts and ICC profiles) is static
     * too: without this, every one of those requests costs a Supabase
     * getUser() round trip. No app route may live under /pdfjs/, since it
     * would lose the session refresh and the sign-in redirect.
     */
    "/((?!_next/static|_next/image|favicon.ico|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
