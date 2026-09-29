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
      <h1>Log in</h1>
      <button onClick={handleGoogleLogin} className={styles.googleButton}>
        Continue with Google
      </button>
    </main>
  );
}
