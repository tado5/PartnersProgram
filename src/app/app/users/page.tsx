import { redirect } from "next/navigation";

import { UserAdminPanel } from "@/components/users/user-admin-panel";
import { requireCompanyPage } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function UsersPage() {
  const context = await requireCompanyPage(["admin"]);
  if (!context) {
    redirect("/login");
  }
  if (context.user.role === "seller") {
    redirect("/app");
  }

  const initialUsers = await prisma.user.findMany({
    where: { companyId: context.companyId, role: { in: ["admin", "seller"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
        Administrácia
      </p>
      <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight text-stone-950">
        Správa používateľov
      </h1>
      <UserAdminPanel
        initialUsers={initialUsers.map((user) => ({
          ...user,
          role: user.role === "admin" ? "admin" : "seller",
          id: user.id.toString(),
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </section>
  );
}
