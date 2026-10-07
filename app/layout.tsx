import type { Metadata } from "next";
import { Comic_Neue } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import styles from "./page.module.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

// Comic Sans isn't installed on phones, so Comic Neue is the web fallback.
const comicNeue = Comic_Neue({
  variable: "--font-comic-neue",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Venice-Style Captions",
  description: "Upload a photo, get deadpan venice-style captions, and vote on the funniest.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let avatarUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <html lang="en" className={comicNeue.variable}>
      <body>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            Venice-Style Captions
          </Link>
          <nav className={styles.nav}>
            <Link href="/">Feed</Link>
            {user ? (
              <>
                <Link href="/create">Create</Link>
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/profile" className={styles.navProfileLink}>
                  {avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Your profile photo"
                      className={styles.navAvatar}
                    />
                  )}
                  Profile
                </Link>
                <SignOutButton />
              </>
            ) : (
              <Link href="/login" className={styles.navCta}>
                Log in
              </Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
