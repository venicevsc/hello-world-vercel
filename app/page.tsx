import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";
import LikeButton from "./like-button";
import VoteButtons from "./vote-buttons";

type Caption = {
  id: number;
  caption_text: string;
  angle: string | null;
  created_at: string;
};

type Photo = {
  id: number;
  image_url: string;
  alt_text: string | null;
  created_at: string;
  captions: Caption[];
};

const ANGLE_LABELS: Record<string, string> = {
  photo: "about the photo",
  name: "name play",
  both: "photo + name",
};

function findCaptionOfTheDay(photos: Photo[], scoreById: Map<number, number>) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let best: { photo: Photo; caption: Caption; score: number } | null = null;

  for (const photo of photos) {
    for (const caption of photo.captions) {
      if (new Date(caption.created_at).getTime() < since) continue;
      const score = scoreById.get(caption.id) ?? 0;
      if (score > 0 && (!best || score > best.score)) {
        best = { photo, caption, score };
      }
    }
  }
  return best;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const sortMode = sort === "top" ? "top" : "new";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: photos, error } = await supabase
    .from("photos")
    .select(
      "id, image_url, alt_text, created_at, captions(id, caption_text, angle, created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(40)
    .returns<Photo[]>();

  if (error || !photos) {
    return (
      <main className={styles.main}>
        <h1>Venice-Style Captions</h1>
        <p>Failed to load captions: {error?.message}</p>
      </main>
    );
  }

  const captionIds = photos.flatMap((photo) => photo.captions.map((c) => c.id));

  const [scores, myVotes, myLikes] = await Promise.all([
    captionIds.length
      ? supabase
          .from("caption_scores")
          .select("caption_id, score")
          .in("caption_id", captionIds)
          .then((res) => res.data ?? [])
      : [],
    user && captionIds.length
      ? supabase
          .from("caption_votes")
          .select("caption_id, vote")
          .in("caption_id", captionIds)
          .then((res) => res.data ?? [])
      : [],
    user
      ? supabase
          .from("likes")
          .select("photo_id")
          .then((res) => res.data ?? [])
      : [],
  ]);

  const scoreById = new Map<number, number>(
    scores.map((s) => [s.caption_id as number, s.score as number]),
  );
  const voteById = new Map<number, number>(
    myVotes.map((v) => [v.caption_id as number, v.vote as number]),
  );
  const likedPhotoIds = new Set<number>(myLikes.map((l) => l.photo_id as number));

  const feed = photos.map((photo) => ({
    ...photo,
    captions: [...photo.captions].sort(
      (a, b) =>
        (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) || a.id - b.id,
    ),
  }));

  if (sortMode === "top") {
    const best = (photo: Photo) =>
      Math.max(-Infinity, ...photo.captions.map((c) => scoreById.get(c.id) ?? 0));
    feed.sort(
      (a, b) =>
        best(b) - best(a) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  const captionOfTheDay = findCaptionOfTheDay(photos, scoreById);

  return (
    <main className={styles.main}>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <h1>Deadpan captions for your photos</h1>
          <p className={styles.tagline}>
            Upload a photo and the bot answers it venice-style: literal,
            absurd, and completely straight-faced. Vote for the funniest.
          </p>
          {user ? (
            <Link href="/create" className={styles.buttonPrimary}>
              Make captions
            </Link>
          ) : (
            <Link href="/login" className={styles.buttonPrimary}>
              Log in to vote and create
            </Link>
          )}
        </div>

        {captionOfTheDay ? (
          <section className={styles.hero} aria-label="Caption of the day">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.heroImage}
              src={captionOfTheDay.photo.image_url}
              alt={captionOfTheDay.photo.alt_text ?? "Caption of the day photo"}
            />
            <div>
              <p className={styles.heroLabel}>Caption of the day</p>
              <p className={styles.heroCaption}>{captionOfTheDay.caption.caption_text}</p>
              <p className={styles.hint}>
                {captionOfTheDay.score} point{captionOfTheDay.score === 1 ? "" : "s"}
              </p>
            </div>
          </section>
        ) : (
          <section className={styles.hero} aria-label="Caption of the day">
            <div>
              <p className={styles.heroLabel}>Caption of the day</p>
              <p className={styles.heroCaption}>&ldquo;what&apos;s up?&rdquo; / &ldquo;the ceiling&rdquo;</p>
              <p className={styles.hint}>
                The top-voted caption from the last 24 hours shows up here.
              </p>
            </div>
          </section>
        )}
      </section>

      {!user && (
        <p className={styles.notice}>
          You&apos;re browsing as a guest. <Link href="/login">Log in</Link> to
          vote on captions, like photos, and make your own.
        </p>
      )}

      <div className={styles.toolbar}>
        <h2>The feed</h2>
        <div className={styles.sortRow}>
          <Link
            href="/?sort=new"
            className={sortMode === "new" ? styles.sortActive : styles.sortLink}
          >
            New
          </Link>
          <Link
            href="/?sort=top"
            className={sortMode === "top" ? styles.sortActive : styles.sortLink}
          >
            Top
          </Link>
        </div>
      </div>

      {feed.length === 0 ? (
        <p className={styles.empty}>
          Nothing here yet.{" "}
          {user ? (
            <Link href="/create">Be the first to make one.</Link>
          ) : (
            <Link href="/login">Log in to make the first one.</Link>
          )}
        </p>
      ) : (
        <div className={styles.grid}>
          {feed.map((photo) => (
            <div key={photo.id} className={styles.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.photo}
                src={photo.image_url}
                alt={photo.alt_text ?? "Joke photo"}
              />
              <ul className={styles.captions}>
                {photo.captions.map((caption) => (
                  <li key={caption.id}>
                    <VoteButtons
                      captionId={caption.id}
                      userId={user?.id ?? null}
                      initialScore={scoreById.get(caption.id) ?? 0}
                      initialVote={(voteById.get(caption.id) ?? 0) as -1 | 0 | 1}
                    />
                    <span className={styles.captionText}>{caption.caption_text}</span>
                    {caption.angle && (
                      <span className={styles.angleTag}>
                        {ANGLE_LABELS[caption.angle] ?? caption.angle}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <LikeButton
                photoId={photo.id}
                isLoggedIn={!!user}
                initiallyLiked={likedPhotoIds.has(photo.id)}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
