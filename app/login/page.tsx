"use client";

import { createClient } from "@/lib/supabase/client";
import styles from "../page.module.css";

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main className={styles.main}>
      <div className={`${styles.panel} ${styles.centered}`}>
        <h1>Log in</h1>
        <p className={styles.tagline}>
          You need an account to vote on captions, like photos, and make your
          own. Browsing the feed is open to everyone.
        </p>
        <button onClick={handleGoogleLogin} className={styles.googleButton}>
          Continue with Google
        </button>
      </div>
    </main>
  );
}
