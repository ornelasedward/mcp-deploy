import PlaygroundClient from "./playground-client";
import { apiBase } from "../../../lib/api-shared";

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let isPublic = false;
  try {
    const res = await fetch(`${apiBase()}/v1/public/agents/${slug}`, {
      next: { revalidate: 30 },
    });
    isPublic = res.ok;
  } catch {
    isPublic = false;
  }

  return <PlaygroundClient slug={slug} isPublic={isPublic} />;
}
