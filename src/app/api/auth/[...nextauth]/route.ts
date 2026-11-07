import { handlers } from "@/auth";
import { decode } from "next-auth/jwt";
import { env } from "@/lib/env";
import { rememberedSessionSeconds } from "@/server/auth/session-policy";

const sessionCookie =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

async function asSessionCookie(response: Response) {
  const headers = new Headers(response.headers);
  const cookies = headers.getSetCookie();
  headers.delete("set-cookie");
  const tokenParts = cookies.map(cookie => {
    const separator = cookie.indexOf("=");
    return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1).split(";", 1)[0] };
  }).filter(cookie => cookie.name === sessionCookie || cookie.name.startsWith(`${sessionCookie}.`))
    .filter(cookie => cookie.value)
    .sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true }));
  let rememberedUntil: number | null = null;
  if (tokenParts.length) {
    if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET is required to process session cookies.");
    const token = await decode({ token: tokenParts.map(part => part.value).join(""), secret: env.AUTH_SECRET, salt: sessionCookie });
    if (token?.rememberLogin === true && typeof token.loginAt === "number" && Number.isSafeInteger(token.loginAt)) {
      rememberedUntil = token.loginAt + rememberedSessionSeconds * 1000;
    }
  }

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    const cookieName = cookie.slice(0, separator);
    const cookieValue = cookie.slice(separator + 1).split(";", 1)[0];
    const isSessionCookie =
      cookieName === sessionCookie || cookieName.startsWith(`${sessionCookie}.`);
    let outboundCookie =
      isSessionCookie && cookieValue
        ? cookie.replace(/;\s*(?:Expires|Max-Age)=[^;]*/gi, "")
        : cookie;
    if (isSessionCookie && cookieValue && rememberedUntil !== null) {
      outboundCookie += `; Expires=${new Date(rememberedUntil).toUTCString()}; Max-Age=${Math.max(0, Math.floor((rememberedUntil - Date.now()) / 1000))}`;
    }
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
