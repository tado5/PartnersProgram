import { NextResponse } from "next/server";

import { privacyDraftSchema } from "@/lib/privacy";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { getCompanyPrivacy, saveCompanyPrivacyDraft, withPrivacyErrors } from "@/server/privacy";

export const GET = withPrivacyErrors(async () => {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  return NextResponse.json(await getCompanyPrivacy(authorization.companyId), {
    headers: { "Cache-Control": "no-store" },
  });
});

export const PUT = withPrivacyErrors(async (request: Request) => {
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
  const parsed = await readJson(request, privacyDraftSchema);
  if ("response" in parsed) return parsed.response;
  return NextResponse.json(await saveCompanyPrivacyDraft(authorization, parsed.data), {
    headers: { "Cache-Control": "no-store" },
  });
});
