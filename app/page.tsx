import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";
import LikeButton from "./like-button";
import VoteButtons from "./vote-buttons";

type Caption = {
  id: number;
  caption_text: string;
  setup?: string | null;
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

// A post is one joke: a photo caption, or a chat exchange (photo is null).
type Post = { photo: Photo | null; caption: Caption };

type Sort = "new" | "top";
type Kind = "all" | "photos" | "chats";

// Older photo captions were generated with name-play angles.
const ANGLE_LABELS: Record<string, string> = {
  name: "name play",
  both: "photo + name",
};

function findPostOfTheDay(posts: Post[], score: (c: Caption) => number) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let best: (Post & { score: number }) | null = null;

  for (const post of posts) {
    if (new Date(post.caption.created_at).getTime() < since) continue;
    const points = score(post.caption);
    if (points > 0 && (!best || points > best.score)) {
      best = { ...post, score: points };
    }
  }
  return best;
}

function feedHref(sort: Sort, kind: Kind) {
  const params = new URLSearchParams();
  if (sort !== "new") params.set("sort", sort);
  if (kind !== "all") params.set("type", kind);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function ChatBubbles({ caption }: { caption: Caption }) {
  return (
    <div className={styles.chatCard}>
      <p className={styles.bubbleMe}>{caption.setup}</p>
      <p className={styles.bubbleBot}>{caption.caption_text}</p>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; type?: string }>;
}) {
  const { sort, type } = await searchParams;
  const sortMode: Sort = sort === "top" ? "top" : "new";
  const kind: Kind = type === "photos" || type === "chats" ? type : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [photosRes, chatsRes] = await Promise.all([
    supabase
      .from("photos")
      .select(
        "id, image_url, alt_text, created_at, captions(id, caption_text, angle, created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<Photo[]>(),
    supabase
      .from("captions")
      .select("id, caption_text, setup, angle, created_at")
      .is("photo_id", null)
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<Caption[]>(),
  ]);

  const { data: photos, error } = photosRes;
  // A chat query failure (e.g. chat_jokes.sql not run yet) shouldn't hide the photo feed.
  if (chatsRes.error) console.error("Loading chat posts failed:", chatsRes.error);
  const chats = chatsRes.data ?? [];

  if (error || !photos) {
    return (
      <main className={styles.main}>
        <h1>Venice-Style Captions</h1>
        <p>Failed to load captions: {error?.message}</p>
      </main>
    );
  }

  const captionIds = [
    ...photos.flatMap((photo) => photo.captions.map((c) => c.id)),
    ...chats.map((c) => c.id),
  ];

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

  // One post per caption, so each joke is voted on by itself.
  const score = (caption: Caption) => scoreById.get(caption.id) ?? 0;
  const newest = (a: Caption, b: Caption) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  // Each photo is a queue of its posts; each chat post is a queue of one.
  const queues: Post[][] = [
    ...(kind === "chats"
      ? []
      : photos.map((photo) =>
          [...photo.captions]
            .sort((a, b) => score(b) - score(a) || a.id - b.id)
            .map((caption) => ({ photo, caption })),
        )),
    ...(kind === "photos" ? [] : chats.map((caption) => [{ photo: null, caption }])),
  ]
    .filter((queue) => queue.length > 0)
    .sort((a, b) => newest(a[0].caption, b[0].caption));

  let feed: Post[];
  if (sortMode === "top") {
    feed = queues
      .flat()
      .sort((a, b) => score(b.caption) - score(a.caption) || newest(a.caption, b.caption));
  } else {
    // Round-robin, newest first, so the same photo doesn't show up several times in a row.
    feed = [];
    for (let round = 0; queues.some((q) => q.length > round); round++) {
      for (const queue of queues) {
        if (queue[round]) feed.push(queue[round]);
      }
    }
  }

  const postOfTheDay = findPostOfTheDay(
    [
      ...photos.flatMap((photo) => photo.captions.map((caption) => ({ photo, caption }))),
      ...chats.map((caption) => ({ photo: null, caption })),
    ],
    score,
  );

  return (
    <main className={styles.main}>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <h1>Deadpan jokes, venice-style</h1>
          <p className={styles.tagline}>
            Upload a photo or text the bot, and it answers venice-style:
            literal, absurd, and completely straight-faced. Vote for the
            funniest.
          </p>
          {user ? (
            <div className={styles.actionRow}>
              <Link href="/create" className={styles.buttonPrimary}>
                Caption a photo
              </Link>
              <Link href="/chat" className={styles.buttonSecondary}>
                Text the bot
              </Link>
            </div>
          ) : (
            <Link href="/login" className={styles.buttonPrimary}>
              Log in to vote and create
            </Link>
          )}
        </div>

        <section className={styles.hero} aria-label="Joke of the day">
          {postOfTheDay?.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.heroImage}
              src={postOfTheDay.photo.image_url}
              alt={postOfTheDay.photo.alt_text ?? "Joke of the day photo"}
            />
          )}
          <div>
            <p className={styles.heroLabel}>Joke of the day</p>
            {postOfTheDay ? (
              <>
                <p className={styles.heroCaption}>
                  {postOfTheDay.caption.setup
                    ? `“${postOfTheDay.caption.setup}” / “${postOfTheDay.caption.caption_text}”`
                    : postOfTheDay.caption.caption_text}
                </p>
                <p className={styles.hint}>
                  {postOfTheDay.score} point{postOfTheDay.score === 1 ? "" : "s"}
                </p>
              </>
            ) : (
              <>
                <p className={styles.heroCaption}>&ldquo;what&apos;s up?&rdquo; / &ldquo;the ceiling&rdquo;</p>
                <p className={styles.hint}>
                  The top-voted joke from the last 24 hours shows up here.
                </p>
              </>
            )}
          </div>
        </section>
      </section>

      {!user && (
        <p className={styles.notice}>
          You&apos;re browsing as a guest. <Link href="/login">Log in</Link> to
          vote on jokes, like photos, and make your own.
        </p>
      )}

      <div className={styles.toolbar}>
        <h2>The feed</h2>
        <div className={styles.actionRow}>
          <div className={styles.sortRow}>
            {(["all", "photos", "chats"] as const).map((k) => (
              <Link
                key={k}
                href={feedHref(sortMode, k)}
                className={kind === k ? styles.sortActive : styles.sortLink}
              >
                {k === "all" ? "All" : k === "photos" ? "Photos" : "Chats"}
              </Link>
            ))}
          </div>
          <div className={styles.sortRow}>
            {(["new", "top"] as const).map((s) => (
              <Link
                key={s}
                href={feedHref(s, kind)}
                className={sortMode === s ? styles.sortActive : styles.sortLink}
              >
                {s === "new" ? "New" : "Top"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {feed.length === 0 ? (
        <p className={styles.empty}>
          Nothing here yet.{" "}
          {user ? (
            <Link href={kind === "chats" ? "/chat" : "/create"}>
              Be the first to make one.
            </Link>
          ) : (
            <Link href="/login">Log in to make the first one.</Link>
          )}
        </p>
      ) : (
        <div className={styles.grid}>
          {feed.map(({ photo, caption }) => (
            <article key={caption.id} className={styles.card}>
              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.photo}
                    src={photo.image_url}
                    alt={photo.alt_text ?? "Joke photo"}
                  />
                  <p className={styles.postCaption}>{caption.caption_text}</p>
                </>
              ) : (
                <ChatBubbles caption={caption} />
              )}
              <div className={styles.postFooter}>
                <VoteButtons
                  captionId={caption.id}
                  userId={user?.id ?? null}
                  initialScore={score(caption)}
                  initialVote={(voteById.get(caption.id) ?? 0) as -1 | 0 | 1}
                />
                {caption.angle && ANGLE_LABELS[caption.angle] && (
                  <span className={styles.angleTag}>{ANGLE_LABELS[caption.angle]}</span>
                )}
                {photo && (
                  <LikeButton
                    photoId={photo.id}
                    isLoggedIn={!!user}
                    initiallyLiked={likedPhotoIds.has(photo.id)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
