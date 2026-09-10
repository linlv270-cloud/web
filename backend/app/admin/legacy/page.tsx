import { redirect } from "next/navigation";

export const metadata = { title: "旧运营台" };

export default function LegacyAdminPage() {
  redirect("/admin");
}
