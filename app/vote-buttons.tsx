"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type Vote = -1 | 0 | 1;

export default function VoteButtons({
  captionId,
  userId,
  initialScore,
  initialVote,
}: {
  captionId: number;
  userId: string | null;
  initialScore: number;
  initialVote: Vote;
}) {
  const [score, setScore] = useState(initialScore);
  const [vote, setVote] = useState<Vote>(initialVote);
  const [pending, setPending] = useState(false);

  if (!userId) {
    return (
      <span className={styles.votes}>
        <Link href="/login" className={styles.voteButton} title="Log in to vote">
          {"▲"}
        </Link>
        <span className={styles.score}>{score}</span>
        <Link href="/login" className={styles.voteButton} title="Log in to vote">
          {"▼"}
        </Link>
      </span>
    );
  }

  const cast = async (clicked: 1 | -1) => {
    if (pending) return;
    const previous = vote;
    const previousScore = score;
    const next: Vote = previous === clicked ? 0 : clicked;

    setPending(true);
    setVote(next);
    setScore(previousScore - previous + next);

    const supabase = createClient();
    const votes = supabase.from("caption_votes");
    const { error } =
      next === 0
        ? await votes.delete().eq("caption_id", captionId).eq("user_id", userId)
        : previous === 0
          ? await votes.insert({ user_id: userId, caption_id: captionId, vote: next })
          : await votes
              .update({ vote: next })
              .eq("caption_id", captionId)
              .eq("user_id", userId);

    if (error) {
      setVote(previous);
      setScore(previousScore);
    }
    setPending(false);
  };

  return (
    <span className={styles.votes}>
      <button
        type="button"
        className={`${styles.voteButton} ${vote === 1 ? styles.voteUp : ""}`}
        aria-label="Upvote"
        aria-pressed={vote === 1}
        disabled={pending}
        onClick={() => cast(1)}
      >
        {"▲"}
      </button>
      <span className={styles.score}>{score}</span>
      <button
        type="button"
        className={`${styles.voteButton} ${vote === -1 ? styles.voteDown : ""}`}
        aria-label="Downvote"
        aria-pressed={vote === -1}
        disabled={pending}
        onClick={() => cast(-1)}
      >
        {"▼"}
      </button>
    </span>
  );
}
