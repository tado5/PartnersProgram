import { env } from "@/lib/env";
import { allowPublicRequest, getClientIp } from "@/server/auth/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

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

  if (pathname === "/api/health") {
    if (request.method !== "GET") {
      return new NextResponse(null, {
        status: 405,
        headers: { "Cache-Control": "no-store", Allow: "GET" },
      });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/k/") || pathname.startsWith("/api/public/card/") || pathname.startsWith("/ochrana-udajov/") || pathname === "/gdpr") {
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
    const response = pathname.startsWith("/api/")
      ? NextResponse.next()
      : pageResponse(request);
    for (const [name, value] of Object.entries(publicHeaders())) response.headers.set(name, value);
    return response;
  }

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return pageResponse(request);
  }

  const sessionCookie =
    request.cookies.get(
      env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
    ) ?? request.cookies.get("authjs.session-token");

  if (sessionCookie) {
    return pageResponse(request);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Vyžaduje sa prihlásenie." } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", env.NODE_ENV === "production" ? env.APP_BASE_URL : request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*", "/superadmin/:path*", "/change-password", "/login", "/api/:path*", "/k/:path*", "/ochrana-udajov/:path*", "/gdpr"],
};

function pageResponse(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function publicHeaders(extra?: Record<string, string>) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extra,
  };
}
