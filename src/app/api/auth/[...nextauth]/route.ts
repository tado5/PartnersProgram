import { handlers } from "@/auth";

const sessionCookie =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

async function asSessionCookie(response: Response) {
  const headers = new Headers(response.headers);
  const cookies = headers.getSetCookie();
  headers.delete("set-cookie");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    const cookieName = cookie.slice(0, separator);
    const cookieValue = cookie.slice(separator + 1).split(";", 1)[0];
    const isSessionCookie =
      cookieName === sessionCookie || cookieName.startsWith(`${sessionCookie}.`);
    const outboundCookie =
      isSessionCookie && cookieValue
        ? cookie.replace(/;\s*(?:Expires|Max-Age)=[^;]*/gi, "")
        : cookie;
    headers.append(
      "set-cookie",
      outboundCookie,
    );
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function GET(request: Parameters<typeof handlers.GET>[0]) {
  return asSessionCookie(await handlers.GET(request));
}

export async function POST(request: Parameters<typeof handlers.POST>[0]) {
  return asSessionCookie(await handlers.POST(request));
}
