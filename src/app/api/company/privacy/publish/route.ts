import { NextResponse } from "next/server";

import { privacyPublishSchema } from "@/lib/privacy";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { publishCompanyPrivacyNotice, withPrivacyErrors } from "@/server/privacy";

export const POST = withPrivacyErrors(async (request: Request) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } }, { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  if (authorization.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Oznámenie môže meniť iba admin danej firmy." } }, { status: 403 },
    );
  }
  const parsed = await readJson(request, privacyPublishSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json({ notice: await publishCompanyPrivacyNotice(authorization, parsed.data) }, {
    headers: { "Cache-Control": "no-store" },
  });
});
