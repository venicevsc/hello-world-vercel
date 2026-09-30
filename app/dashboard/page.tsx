import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "../page.module.css";

type Caption = {
  id: number;
  caption_text: string;
};

type LikedPhoto = {
  photo_id: number;
  photos: {
    id: number;
    image_url: string;
    alt_text: string | null;
    captions: Caption[];
  } | null;
};

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
    .select("first_name, last_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data: likes } = await supabase
    .from("likes")
    .select(
      "photo_id, photos(id, image_url, alt_text, captions(id, caption_text))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<LikedPhoto[]>();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={styles.main}>
      <div className={styles.profileSummary}>
        {profile?.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt="Your profile photo"
            className={styles.avatarPreview}
          />
        )}
        <div>
          <h1>Welcome back{fullName ? `, ${fullName}` : ""}!</h1>
          <Link href="/profile">Edit your profile</Link>
        </div>
      </div>

      <h2>Your Likes</h2>
      {likes && likes.length > 0 ? (
        <div className={styles.grid}>
          {likes.map(
            (like) =>
              like.photos && (
                <div key={like.photo_id} className={styles.card}>
                  <img
                    className={styles.photo}
                    src={like.photos.image_url}
                    alt={like.photos.alt_text ?? "Liked photo"}
                  />
                  <ul className={styles.captions}>
                    {like.photos.captions.map((caption) => (
                      <li key={caption.id}>{caption.caption_text}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      ) : (
        <p>You haven&apos;t liked anything yet.</p>
      )}
    </main>
  );
}
