export interface ClerkIdentity {
  userId: string;
  orgId?: string;
}

/** Verify Clerk session JWT when @clerk/backend is available. */
export async function verifyClerkToken(
  token: string,
  secretKey: string,
): Promise<ClerkIdentity | null> {
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, { secretKey });
    const sub = payload.sub;
    if (!sub) return null;
    const orgId =
      (payload as { org_id?: string }).org_id ??
      (payload as { o?: { id?: string } }).o?.id;
    return { userId: sub, orgId };
  } catch {
    return null;
  }
}
