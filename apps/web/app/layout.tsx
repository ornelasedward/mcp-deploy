import { Providers } from "../components/providers";

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
