import { hasSameOrigin, parseUserId } from "@/server/auth/http";
import { contextError } from "@/server/auth/session";
import { superadminApi } from "@/server/auth/superadmin";
import { changeCompany } from "@/server/companies";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return superadminApi(async (context) => {
    if (!hasSameOrigin(request)) return contextError("INVALID_ORIGIN", "Neplatný pôvod požiadavky.", 403);
    const id = parseUserId((await params).id);
    if (!id) return contextError("VALIDATION_ERROR", "Neplatné ID.", 400);
    return { company: await changeCompany(context, id, { action: "activate" }) };
  });
}
