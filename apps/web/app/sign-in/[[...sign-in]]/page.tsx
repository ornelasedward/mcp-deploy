import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { hasClerk } from "../../../lib/clerk";

export default function SignInPage() {
  if (!hasClerk) redirect("/dashboard");
  return (
    <main style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
      <SignIn />
    </main>
  );
}
