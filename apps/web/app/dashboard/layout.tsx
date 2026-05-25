import { Suspense } from "react";
import { SamlTokenCapture } from "../../components/saml-token-capture";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <SamlTokenCapture />
      </Suspense>
      {children}
    </>
  );
}
