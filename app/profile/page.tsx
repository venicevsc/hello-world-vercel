import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";
import styles from "../page.module.css";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url, hometown")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className={styles.main}>
      <div className={`${styles.panel} ${styles.centered}`}>
        <h1>Your Profile</h1>
        {welcome === "1" && (
          <p className={styles.notice}>
            Welcome! Please add your first and last name below.
          </p>
        )}
        <ProfileForm
          userId={user.id}
          initialFirstName={profile?.first_name ?? ""}
          initialLastName={profile?.last_name ?? ""}
          initialHometown={profile?.hometown ?? ""}
          initialAvatarUrl={profile?.avatar_url ?? null}
        />
      </div>
    </main>
  );
}
