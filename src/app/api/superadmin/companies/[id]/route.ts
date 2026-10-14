import { companyUpdateSchema } from "@/lib/schemas";
import { hasSameOrigin, parseUserId, readJson } from "@/server/auth/http";
import { contextError } from "@/server/auth/session";
import { superadminApi } from "@/server/auth/superadmin";
import { changeCompany, companyDetails } from "@/server/companies";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  return superadminApi(async () => {
    const id = parseUserId((await params).id);
    if (!id) return contextError("VALIDATION_ERROR", "Neplatné ID.", 400);
    return { company: await companyDetails(id) };
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  return superadminApi(async (context) => {
    if (!hasSameOrigin(request)) return contextError("INVALID_ORIGIN", "Neplatný pôvod požiadavky.", 403);
    const id = parseUserId((await params).id);
    if (!id) return contextError("VALIDATION_ERROR", "Neplatné ID.", 400);
    const parsed = await readJson(request, companyUpdateSchema);
    if ("response" in parsed) return parsed.response;
    return { company: await changeCompany(context, id, { action: "update", data: parsed.data }) };
  });
}
