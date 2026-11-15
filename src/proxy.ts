import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

const authPages = ["/sign-in", "/sign-up"];

/**
 * Session refresh and coarse redirects for signed-in areas only.
 * Public pages (/, /b/*, /manage/*) and API routes are deliberately not matched:
 * they never need a session, so a session Set-Cookie can't end up in a shared cache.
 * Authorization still happens in every Server Action and in RLS.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, claims } = await updateSession(request);
  const signedIn = Boolean(claims?.sub);

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirect.headers.set(header, value);
    }
    return redirect;
  };

  if (!signedIn && !authPages.includes(pathname)) {
    return redirectTo("/sign-in");
  }

  if (signedIn && authPages.includes(pathname)) {
    return redirectTo("/dashboard");
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/sign-in", "/sign-up"],
};
