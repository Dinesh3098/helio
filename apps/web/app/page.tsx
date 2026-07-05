import { redirect } from "next/navigation";

// The dashboard guard bounces unauthenticated visitors on to /login.
export default function Home() {
  redirect("/inbox");
}
