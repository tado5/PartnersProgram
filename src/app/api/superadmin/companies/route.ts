import { companyCreateSchema } from "@/lib/schemas";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { contextError } from "@/server/auth/session";
import { superadminApi } from "@/server/auth/superadmin";
import { createCompany, listCompanies } from "@/server/companies";

export async function GET(request: Request) {
  return superadminApi(async () => {
    const query = new URL(request.url).searchParams;
    return listCompanies({
      q: query.get("q") ?? "", active: query.get("active") ?? "all",
      page: Number(query.get("page") ?? 1), pageSize: Number(query.get("pageSize") ?? 20),
    });
  });
}

export async function POST(request: Request) {
  return superadminApi(async (context) => {
    if (!hasSameOrigin(request)) return contextError("INVALID_ORIGIN", "Neplatný pôvod požiadavky.", 403);
    const parsed = await readJson(request, companyCreateSchema);
    if ("response" in parsed) return parsed.response;
    return { company: await createCompany(context, parsed.data) };
  }, 201);
}
