"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "../page.module.css";

type Props = {
  userId: string;
  initialFirstName: string;
  initialLastName: string;
  initialHometown: string;
  initialAvatarUrl: string | null;
};

export default function ProfileForm({
  userId,
  initialFirstName,
  initialLastName,
  initialHometown,
  initialAvatarUrl,
}: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [hometown, setHometown] = useState(initialHometown);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    let nextAvatarUrl = avatarUrl;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setMessage(`Failed to upload photo: ${uploadError.message}`);
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      nextAvatarUrl = publicUrlData.publicUrl;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        hometown: hometown.trim() || null,
        avatar_url: nextAvatarUrl,
      })
      .eq("id", userId);

    setSaving(false);

    if (error) {
      setMessage(`Failed to save profile: ${error.message}`);
      return;
    }

    setAvatarUrl(nextAvatarUrl);
    setMessage("Saved!");
    router.refresh();
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="Profile photo"
          className={styles.avatarPreview}
        />
      )}

      <label>
        Profile photo
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className={styles.formRow}>
        <label>
          First name
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </label>

        <label>
          Last name
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </label>
      </div>

      <label>
        Hometown (optional)
        <input
          type="text"
          value={hometown}
          maxLength={60}
          placeholder="e.g. Chicago"
          onChange={(e) => setHometown(e.target.value)}
        />
      </label>

      <button type="submit" className={styles.buttonPrimary} disabled={saving}>
        {saving ? "Saving..." : "Save profile"}
      </button>

      {message && <p>{message}</p>}
    </form>
  );
}
