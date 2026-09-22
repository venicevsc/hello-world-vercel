import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type Caption = {
  id: number;
  caption_text: string;
};

type Photo = {
  id: number;
  image_url: string;
  alt_text: string | null;
  captions: Caption[];
};

export default async function Home() {
  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, image_url, alt_text, captions(id, caption_text)")
    .order("created_at", { ascending: false })
    .returns<Photo[]>();

  if (error) {
    return (
      <main className={styles.main}>
        <h1>Photo Joke Captions</h1>
        <p>Failed to load jokes: {error.message}</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <h1>Photo Joke Captions</h1>
      <div className={styles.grid}>
        {photos?.map((photo) => (
          <div key={photo.id} className={styles.card}>
            <img
              className={styles.photo}
              src={photo.image_url}
              alt={photo.alt_text ?? "Joke photo"}
            />
            <ul className={styles.captions}>
              {photo.captions.map((caption) => (
                <li key={caption.id}>{caption.caption_text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
