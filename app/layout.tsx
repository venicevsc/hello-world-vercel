import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import styles from "./page.module.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Photo Joke Captions",
  description: "Photos paired with crowd-sourced joke captions, read live from Supabase.",
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <nav className={styles.nav}>
          <Link href="/">Home</Link>
          {user ? (
            <>
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
            <Link href="/login">Log in</Link>
          )}
        </nav>
        {children}
      </body>
    </html>
  );
}
