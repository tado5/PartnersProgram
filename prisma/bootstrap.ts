import { hash } from "@node-rs/argon2";
import type { PrismaClient, UserRole } from "@prisma/client";

export async function bootstrapUser(
  prisma: PrismaClient, values: {
    email: string; name: string; role: UserRole; password: string; companyId: bigint | null;
  },
) {
  const email = values.email.trim().toLowerCase();
  const passwordHash = await hash(values.password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  return prisma.$transaction(async (tx) => {
    // The permanent company lock serializes seeds and global-account management.
    await tx.$queryRaw`SELECT id FROM companies WHERE slug = 'europodlahy' FOR UPDATE`;
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== values.role || existing.companyId !== values.companyId) {
        throw new Error("Bootstrap email is already assigned to another role or company; no account was changed.");
      }
      return existing;
    }
    const user = await tx.user.create({ data: {
      email, name: values.name, role: values.role, companyId: values.companyId,
      passwordHash, isActive: true, mustChangePassword: true,
    } });
    await tx.auditLog.create({ data: {
      companyId: values.companyId, action: "user.create", entityType: "user", entityId: user.id,
      newValues: { method: "bootstrap", role: user.role, email: user.email, name: user.name },
    } });
    return user;
  });
}
