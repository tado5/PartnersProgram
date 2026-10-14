import { env } from "@/lib/env";
import { allowPublicRequest, getClientIp } from "@/server/auth/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/cron/close-monthly-badges") {
    if (request.method !== "POST") {
      return new NextResponse(null, {
        status: 405,
        headers: { "Cache-Control": "no-store", Allow: "POST" },
      });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/k/") || pathname.startsWith("/api/public/card/")) {
    if (request.method !== "GET") {
      return new NextResponse(null, {
        status: 405,
        headers: publicHeaders({ Allow: "GET" }),
      });
    }
    if (!allowPublicRequest(getClientIp(request.headers))) {
      return new NextResponse("Príliš veľa požiadaviek. Skúste neskôr.", {
        status: 429,
        headers: publicHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
      });
    }
    const response = NextResponse.next();
    for (const [name, value] of Object.entries(publicHeaders())) response.headers.set(name, value);
    return response;
  }

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const sessionCookie =
    request.cookies.get(
      env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
    ) ?? request.cookies.get("authjs.session-token");

  if (sessionCookie) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Vyžaduje sa prihlásenie." } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*", "/superadmin/:path*", "/change-password", "/api/:path*", "/k/:path*"],
};

function publicHeaders(extra?: Record<string, string>) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extra,
  };
}
