import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "../page.module.css";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className={styles.main}>
      <h1>
        Welcome back{profile?.first_name ? `, ${profile.first_name}` : ""}!
      </h1>
      <p>This page only renders for logged-in users.</p>
    </main>
  );
}
