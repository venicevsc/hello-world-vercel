import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import LoginButton from "./login-button";
import styles from "../page.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed:
    "That sign-in didn't finish. Please try again, and stay on this page until Google sends you back.",
  missing_code: "That sign-in link was incomplete. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeNext(next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in (back button, bookmarked /login, stale tab): don't ask again.
  if (user) {
    redirect(destination);
  }

  return (
    <main className={styles.main}>
      <div className={`${styles.panel} ${styles.centered}`}>
        <h1>Log in</h1>
        <p className={styles.tagline}>
          You need an account to vote on captions, like photos, and make your
          own. Browsing the feed is open to everyone.
        </p>
        {error && ERROR_MESSAGES[error] && (
          <p className={styles.notice} role="alert">
            {ERROR_MESSAGES[error]}
          </p>
        )}
        <LoginButton next={destination} />
      </div>
    </main>
  );
}
