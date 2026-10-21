import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { type ZodType } from "zod";
import { validationFields } from "@/lib/validation-errors";

// Prisma's query engine accepts signed 64-bit IDs even for unsigned SQL columns.
export const MAX_QUERY_ID = BigInt("9223372036854775807");

export function hasSameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(env.APP_BASE_URL).origin;
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      response: NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Neplatný JSON obsah." } },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { data: parsed.data };
  }

  const fields = validationFields(parsed.error.issues);
  return {
    response: NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Skontrolujte zadané údaje.",
          fields,
        },
      },
      { status: 400 },
    ),
  };
}

export function userResponse(user: {
  id: bigint;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "seller";
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function invalidUserIdResponse() {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Neplatné ID používateľa." } },
    { status: 400 },
  );
}

export function parseUserId(value: string): bigint | null {
  if (!/^\d{1,20}$/.test(value)) {
    return null;
  }
  const id = BigInt(value);
  return id > BigInt(0) && id <= BigInt("18446744073709551615") ? id : null;
}
