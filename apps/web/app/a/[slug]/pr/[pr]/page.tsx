import PlaygroundClient from "../../playground-client";

export default async function PreviewPlaygroundPage({
  params,
}: {
  params: Promise<{ slug: string; pr: string }>;
}) {
  const { slug, pr } = await params;
  return <PlaygroundClient slug={slug} prNumber={Number(pr)} />;
}
