import { env } from "@/lib/env";

type Bucket = {
  count: number;
  expiresAt: number;
};

const buckets = new Map<string, Bucket>();
const windowMs = 60_000;
const maxBuckets = 10_000;

export function getClientIp(headers: Headers): string | undefined {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp.slice(0, 45);
  }

  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, 45) : undefined;
}

export function allowLoginAttempt(ip: string | undefined, now = Date.now()) {
  const key = ip ?? "unknown";
  const bucket = buckets.get(key);

  if (!bucket || bucket.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    pruneExpired(now);
    return true;
  }

  if (bucket.count >= env.RATE_LIMIT_LOGIN_PER_MIN) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function allowPublicRequest(ip: string | undefined, now = Date.now()) {
  const key = `public:${ip ?? "unknown"}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    pruneExpired(now);
    return true;
  }

  if (bucket.count >= env.RATE_LIMIT_PUBLIC_PER_MIN) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function pruneExpired(now: number) {
  if (buckets.size <= maxBuckets) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }

  if (buckets.size > maxBuckets) {
    const oldestKeys = [...buckets.entries()]
      .sort(([, left], [, right]) => left.expiresAt - right.expiresAt)
      .slice(0, buckets.size - maxBuckets);
    for (const [key] of oldestKeys) {
      buckets.delete(key);
    }
  }
}
