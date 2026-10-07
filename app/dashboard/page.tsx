import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "../page.module.css";

type Caption = {
  id: number;
  caption_text: string;
};

type Upload = {
  id: number;
  image_url: string;
  alt_text: string | null;
  captions: Caption[];
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

  const [{ data: uploads }, { data: likes }, { data: remaining }] =
    await Promise.all([
      supabase
        .from("photos")
        .select("id, image_url, alt_text, captions(id, caption_text)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12)
        .returns<Upload[]>(),
      supabase
        .from("likes")
        .select(
          "photo_id, photos(id, image_url, alt_text, captions(id, caption_text))",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .returns<LikedPhoto[]>(),
      supabase.rpc("generations_remaining"),
    ]);

  const uploadCaptionIds = (uploads ?? []).flatMap((u) =>
    u.captions.map((c) => c.id),
  );
  const { data: scores } = uploadCaptionIds.length
    ? await supabase
        .from("caption_scores")
        .select("caption_id, score")
        .in("caption_id", uploadCaptionIds)
    : { data: [] };
  const scoreById = new Map<number, number>(
    (scores ?? []).map((s) => [s.caption_id as number, s.score as number]),
  );

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={styles.main}>
      <div className={`${styles.panel} ${styles.profileSummary}`}>
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
          <p className={styles.hint}>
            {remaining ?? 0} caption generation{remaining === 1 ? "" : "s"} left
            today. <Link href="/create">Make some</Link> or{" "}
            <Link href="/profile">edit your profile</Link>.
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h2>Your Uploads</h2>
        {uploads && uploads.length > 0 ? (
          <div className={styles.grid}>
            {uploads.map((upload) => (
              <div key={upload.id} className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.photo}
                  src={upload.image_url}
                  alt={upload.alt_text ?? "Your upload"}
                />
                <ul className={styles.captions}>
                  {upload.captions.map((caption) => (
                    <li key={caption.id}>
                      <span className={styles.score}>
                        {scoreById.get(caption.id) ?? 0}
                      </span>
                      <span className={styles.captionText}>
                        {caption.caption_text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            You haven&apos;t uploaded anything yet.{" "}
            <Link href="/create">Make your first captions.</Link>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2>Your Likes</h2>
        {likes && likes.length > 0 ? (
          <div className={styles.grid}>
            {likes.map(
              (like) =>
                like.photos && (
                  <div key={like.photo_id} className={styles.card}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.photo}
                      src={like.photos.image_url}
                      alt={like.photos.alt_text ?? "Liked photo"}
                    />
                    <ul className={styles.captions}>
                      {like.photos.captions.map((caption) => (
                        <li key={caption.id}>
                          <span className={styles.captionText}>
                            {caption.caption_text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        ) : (
          <p className={styles.empty}>You haven&apos;t liked anything yet.</p>
        )}
      </section>
    </main>
  );
}
