import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { hasClerk } from "../../../lib/clerk";

export default function SignUpPage() {
  if (!hasClerk) redirect("/dashboard");
  return (
    <main style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
      <SignUp />
    </main>
  );
}
