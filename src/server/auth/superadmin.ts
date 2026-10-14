import { redirect } from "next/navigation";
import { getAuthenticatedUser, isAuthContext, requireRole, type AuthContext } from "./session";
import { CompanyError } from "../companies";
import { NextResponse } from "next/server";

export async function requireSuperadminPage() {
  const context = await getAuthenticatedUser();
  if (!context) redirect("/login");
  if (context.user.mustChangePassword) redirect("/change-password");
  if (context.user.role !== "superadmin") redirect("/app");
  return context;
}

export async function superadminApi<T>(operation: (context: AuthContext) => Promise<T>, status = 200) {
  const context = await requireRole(["superadmin"]);
  if (!isAuthContext(context)) return context;
  try {
    const result = await operation(context);
    if (result instanceof Response) return result;
    return NextResponse.json(result, {
      status, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CompanyError) return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
    throw error;
  }
}
