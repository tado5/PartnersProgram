import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { type ZodType } from "zod";
import { validationFields } from "@/lib/validation-errors";

// Prisma's query engine accepts signed 64-bit IDs even for unsigned SQL columns.
export const MAX_QUERY_ID = BigInt("9223372036854775807");
export const MAX_JSON_BODY_BYTES = 1_048_576;

export function hasSameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(env.APP_BASE_URL).origin;
}

function invalidJsonResponse() {
  return NextResponse.json(
    { error: { code: "INVALID_JSON", message: "Neplatný JSON obsah." } },
    { status: 400 },
  );
}

function oversizedJsonResponse() {
  return NextResponse.json(
    { error: { code: "PAYLOAD_TOO_LARGE", message: "Požiadavka je príliš veľká." } },
    { status: 413 },
  );
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { response: Response }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    return { response: oversizedJsonResponse() };
  }

  const reader = request.body?.getReader();
  if (!reader) return { response: invalidJsonResponse() };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        return { response: oversizedJsonResponse() };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return { response: invalidJsonResponse() };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { response: invalidJsonResponse() };
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
