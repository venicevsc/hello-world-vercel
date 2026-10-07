import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateForm from "./create-form";
import styles from "../page.module.css";

export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/create");
  }

  const { data: remaining } = await supabase.rpc("generations_remaining");

  return (
    <main className={styles.main}>
      <div className={styles.introText}>
        <h1>Make venice-style captions</h1>
        <p className={styles.tagline}>
          Upload a photo and get three deadpan captions about it. Each one
          becomes its own post in the feed.
        </p>
      </div>

      <div className={styles.split}>
        <div className={styles.panel}>
          <CreateForm userId={user.id} initialRemaining={remaining ?? 0} />
        </div>

        <aside className={styles.sideStack}>
          <div className={styles.panel}>
            <h2>How it works</h2>
            <ol className={styles.steps}>
              <li>Pick a photo: a sign, a pigeon, your dorm, anything.</li>
              <li>
                Optionally type a setup line, like &ldquo;are you in central
                park?&rdquo;, and the bot will answer it.
              </li>
              <li>Your captions go straight into the feed for everyone to vote on.</li>
            </ol>
          </div>
          <p className={styles.notice}>
            Want jokes about your name? <Link href="/chat">Text the bot</Link>{" "}
            instead.
          </p>
          <p className={styles.smallPrint}>
            Uploaded photos and their captions are public. Photos are sent to
            Google&apos;s Gemini API on its free tier, and Google may use that
            content to improve its products, so only upload photos you&apos;re
            comfortable sharing.
          </p>
        </aside>
      </div>
    </main>
  );
}
