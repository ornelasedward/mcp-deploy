/** In-memory IP rate limiter (dev/single-node). Swap for Redis in multi-instance prod. */
export class IpRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private maxPerHour: number,
    private windowMs = 60 * 60 * 1000,
  ) {}

  check(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = Date.now();
    const bucket = this.buckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(ip, { count: 1, resetAt: now + this.windowMs });
      return { ok: true };
    }
    if (bucket.count >= this.maxPerHour) {
      return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count += 1;
    return { ok: true };
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
