"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../page.module.css";

type Caption = { angle: string; text: string };
type Result = { imageUrl: string; captions: Caption[] };

const MAX_DIMENSION = 1568;

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't process that image.")),
      "image/jpeg",
      0.85,
    ),
  );
}

export default function CreateForm({
  userId,
  initialRemaining,
}: {
  userId: string;
  initialRemaining: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [stage, setStage] = useState<"idle" | "uploading" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);

  const chooseFile = (next: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  };

  const busy = stage !== "idle";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setError(null);

    try {
      setStage("uploading");
      const blob = await downscale(file);
      const supabase = createClient();
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      setStage("generating");
      const res = await fetch("/api/generate-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");

      setResult({ imageUrl: data.imageUrl, captions: data.captions });
      setRemaining(data.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  };

  const reset = () => {
    setResult(null);
    chooseFile(null);
    setContext("");
    setError(null);
  };

  if (result) {
    return (
      <div className={styles.resultBox}>
        <div className={styles.resultGrid}>
          {result.captions.map((caption, i) => (
            <article key={i} className={styles.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.photo} src={result.imageUrl} alt="Your upload" />
              <p className={styles.postCaption}>{caption.text}</p>
            </article>
          ))}
        </div>
        <p className={styles.hint}>
          Saved as {result.captions.length} separate posts. Other users can now
          vote on each one in the feed. You have{" "}
          {remaining} generation{remaining === 1 ? "" : "s"} left today.
        </p>
        <div className={styles.actionRow}>
          <Link href="/" className={styles.buttonPrimary}>
            See it in the feed
          </Link>
          <button type="button" className={styles.buttonSecondary} onClick={reset}>
            Make another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        Photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </label>

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.createPreview} src={previewUrl} alt="Preview" />
      )}

      <label>
        Setup line (optional)
        <input
          type="text"
          value={context}
          maxLength={200}
          placeholder="e.g. are you in central park?"
          onChange={(e) => setContext(e.target.value)}
          disabled={busy}
        />
      </label>

      <button
        type="submit"
        className={styles.buttonPrimary}
        disabled={!file || busy || remaining <= 0}
      >
        {stage === "uploading"
          ? "Uploading..."
          : stage === "generating"
            ? "Writing captions..."
            : "Generate captions"}
      </button>

      <p className={styles.hint}>
        {remaining} generation{remaining === 1 ? "" : "s"} left today.
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
