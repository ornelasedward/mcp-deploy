"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { hasClerk } from "../lib/clerk";

export function Providers({ children }: { children: React.ReactNode }) {
  if (!hasClerk) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
