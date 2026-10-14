import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const companyCookieName =
  env.NODE_ENV === "production" ? "__Host-company-context" : "company-context";

export type CompanySelection = {
  companyId: string;
  userId: string;
  loginAt: number;
  selectionId: string;
};

function signature(value: string) {
  if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET is required for company selection.");
  return createHmac("sha256", env.AUTH_SECRET).update(value).digest("base64url");
}

export function signCompanySelection(
  values: Omit<CompanySelection, "selectionId">,
) {
  const selection = { ...values, selectionId: randomBytes(16).toString("hex") };
  const payload = Buffer.from(JSON.stringify(selection)).toString("base64url");
  return { value: `${payload}.${signature(payload)}`, selection };
}

export function readCompanySelection(value: string | undefined): CompanySelection | null {
  if (!value || value.length > 1024) return null;
  const [payload, mac, extra] = value.split(".");
  if (!payload || !mac || extra) return null;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(mac);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed.companyId !== "string" ||
      !/^[1-9]\d{0,19}$/.test(parsed.companyId) ||
      BigInt(parsed.companyId) > BigInt("18446744073709551615") ||
      typeof parsed.userId !== "string" ||
      !/^[1-9]\d{0,19}$/.test(parsed.userId) ||
      !Number.isSafeInteger(parsed.loginAt) ||
      typeof parsed.selectionId !== "string" ||
      !/^[a-f0-9]{32}$/.test(parsed.selectionId)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}
