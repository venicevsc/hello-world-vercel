import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChatBox from "./chat-box";
import styles from "../page.module.css";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/chat");
  }

  const [{ data: profile }, { data: remaining }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, hometown")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("chat_replies_remaining"),
  ]);

  const personal = [profile?.first_name, profile?.hometown]
    .filter(Boolean)
    .join(" and ");

  return (
    <main className={styles.main}>
      <div className={styles.introText}>
        <h1>Text the bot</h1>
        <p className={styles.tagline}>
          Send it anything and it answers venice-style. When a reply is good,
          post the exchange to the feed so people can vote on it.
        </p>
      </div>

      <div className={styles.split}>
        <div className={styles.panel}>
          <ChatBox initialRemaining={remaining ?? 0} />
        </div>

        <aside className={styles.sideStack}>
          <div className={styles.panel}>
            <h2>Try texting it</h2>
            <ul className={styles.steps}>
              <li>what&apos;s the plan for tonight?</li>
              <li>are you on your way?</li>
              <li>my name&apos;s {profile?.first_name || "Sam"} btw</li>
              <li>can you pick up some milk?</li>
            </ul>
          </div>
          <p className={styles.notice}>
            {personal
              ? `The bot knows your ${profile?.hometown ? "name and hometown" : "name"} (${personal}) and may riff on it. `
              : "Add your name to your profile and the bot may riff on it. "}
            <Link href="/profile">Edit profile</Link>
          </p>
          <p className={styles.smallPrint}>
            Only the exchanges you post are public. Messages are sent to
            Google&apos;s Gemini API on its free tier, and Google may use them to
            improve its products, so don&apos;t type anything private.
          </p>
        </aside>
      </div>
    </main>
  );
}
