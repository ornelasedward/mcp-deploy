import { Providers } from "../components/providers";

/** Dashboard pages call the live API — skip static prerender at build time. */
export const dynamic = "force-dynamic";

export const metadata = { title: "agentd", description: "deploy agents to every surface" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui", maxWidth: 820, margin: "40px auto", padding: 16 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
