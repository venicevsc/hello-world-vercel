"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../page.module.css";

type Exchange = {
  message: string;
  reply: string | null;
  generationId: number | null;
  posted: boolean;
  error: string | null;
};

export default function ChatBox({ initialRemaining }: { initialRemaining: number }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [posting, setPosting] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [exchanges]);

  const update = (index: number, patch: Partial<Exchange>) =>
    setExchanges((list) =>
      list.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || sending || remaining <= 0) return;

    const history = exchanges.flatMap((x) =>
      x.reply
        ? [
            { from: "me", text: x.message },
            { from: "bot", text: x.reply },
          ]
        : [],
    );
    const index = exchanges.length;
    setExchanges((list) => [
      ...list,
      { message, reply: null, generationId: null, posted: false, error: null },
    ]);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      update(index, { reply: data.reply, generationId: data.generationId });
      setRemaining(data.remaining);
    } catch (err) {
      update(index, {
        error: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setSending(false);
    }
  };

  const post = async (index: number) => {
    const exchange = exchanges[index];
    if (!exchange.generationId || exchange.posted) return;
    setPosting(index);
    const supabase = createClient();
    const { error } = await supabase.rpc("post_chat_joke", {
      p_generation_id: exchange.generationId,
    });
    setPosting(null);
    update(index, error ? { error: "Couldn't post that. Try again." } : { posted: true });
  };

  return (
    <div className={styles.chat}>
      <div className={styles.chatLog} aria-live="polite">
        {exchanges.length === 0 && (
          <p className={styles.chatEmpty}>Say something. Anything. It&apos;s waiting.</p>
        )}
        {exchanges.map((x, i) => (
          <div key={i} className={styles.chatExchange}>
            <p className={styles.bubbleMe}>{x.message}</p>
            {x.reply ? (
              <>
                <p className={styles.bubbleBot}>{x.reply}</p>
                <button
                  type="button"
                  className={styles.postButton}
                  disabled={x.posted || posting === i}
                  onClick={() => post(i)}
                >
                  {x.posted ? "Posted to the feed" : posting === i ? "Posting..." : "Post this"}
                </button>
              </>
            ) : x.error ? (
              <p role="alert" className={styles.chatError}>{x.error}</p>
            ) : (
              <p className={styles.bubbleBot}>typing...</p>
            )}
            {x.reply && x.error && (
              <p role="alert" className={styles.chatError}>{x.error}</p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className={styles.chatInput} onSubmit={send}>
        <input
          type="text"
          value={draft}
          maxLength={200}
          placeholder={remaining > 0 ? "text the bot..." : "out of replies for today"}
          onChange={(e) => setDraft(e.target.value)}
          disabled={remaining <= 0}
          aria-label="Message"
        />
        <button
          type="submit"
          className={styles.buttonPrimary}
          disabled={!draft.trim() || sending || remaining <= 0}
        >
          Send
        </button>
      </form>
      <p className={styles.hint}>
        {remaining} repl{remaining === 1 ? "y" : "ies"} left today.
      </p>
    </div>
  );
}
