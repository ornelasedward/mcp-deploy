import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { agentSlugFromHost } from "./lib/host";

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const isProtected = createRouteMatcher(["/dashboard(.*)"]);

/** P6: `https://{slug}.agentd.dev` → internal `/a/{slug}` playground route. */
function wildcardRewrite(req: NextRequest): NextResponse | null {
  const slug = agentSlugFromHost(req.headers.get("host") ?? "");
  if (!slug) return null;
  const url = req.nextUrl.clone();
  url.pathname = `/a/${slug}`;
  return NextResponse.rewrite(url);
}

const clerk = hasClerk
  ? clerkMiddleware(async (auth, req) => {
      const rewrite = wildcardRewrite(req);
      if (rewrite) return rewrite;
      if (isProtected(req)) await auth.protect();
    })
  : null;

export default async function middleware(req: NextRequest) {
  const rewrite = wildcardRewrite(req);
  if (rewrite) return rewrite;
  if (clerk) return clerk(req, {} as never);
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
