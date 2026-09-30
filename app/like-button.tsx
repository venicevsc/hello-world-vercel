"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type Props = {
  photoId: number;
  isLoggedIn: boolean;
  initiallyLiked: boolean;
};

export default function LikeButton({
  photoId,
  isLoggedIn,
  initiallyLiked,
}: Props) {
  const [liked, setLiked] = useState(initiallyLiked);
  const [pending, setPending] = useState(false);

  if (!isLoggedIn) {
    return (
      <Link href="/login" className={styles.likeButton}>
        Log in to like
      </Link>
    );
  }

  const toggleLike = async () => {
    setPending(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPending(false);
      return;
    }

    if (liked) {
      await supabase
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("photo_id", photoId);
      setLiked(false);
    } else {
      await supabase.from("likes").insert({
        user_id: user.id,
        photo_id: photoId,
      });
      setLiked(true);
    }

    setPending(false);
  };

  return (
    <button
      onClick={toggleLike}
      disabled={pending}
      className={styles.likeButton}
    >
      {liked ? "♥ Liked" : "♡ Like"}
    </button>
  );
}
