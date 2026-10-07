import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiErrorResponse, createWithFallback } from "@/lib/gemini";
import {
  CHAT_SYSTEM_PROMPT,
  buildChatPrompt,
  type ChatTurn,
} from "@/lib/venice-style";

export const maxDuration = 60;

const MAX_HISTORY = 8;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function clean(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail("The chat isn't configured yet.", 500);

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Log in to chat.", 401);

  const message = typeof body.message === "string" ? clean(body.message, 200) : "";
  if (!message) return fail("Type a message first.", 400);

  const history: ChatTurn[] = (Array.isArray(body.history) ? body.history : [])
    .filter(
      (turn): turn is ChatTurn =>
        typeof turn === "object" &&
        turn !== null &&
        (turn.from === "me" || turn.from === "bot") &&
        typeof turn.text === "string",
    )
    .slice(-MAX_HISTORY)
    .map((turn) => ({ from: turn.from, text: clean(turn.text, 280) }));

  const { data: remaining, error: remainingError } = await supabase.rpc(
    "chat_replies_remaining",
  );
  if (remainingError) return fail("Couldn't check your daily limit.", 500);
  if (!remaining || remaining <= 0) {
    return fail("The bot is out of replies for today. Come back tomorrow.", 429);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, hometown")
    .eq("id", user.id)
    .maybeSingle();

  const userPrompt = buildChatPrompt({
    firstName: profile?.first_name ?? null,
    hometown: profile?.hometown ?? null,
    history,
    message,
  });

  let reply: string;
  let model: string;
  try {
    const result = await createWithFallback(apiKey, {
      system_instruction: CHAT_SYSTEM_PROMPT,
      input: userPrompt,
    });
    model = result.model;
    // Keep only the first line and drop wrapping quotes the model sometimes adds.
    reply = clean((result.text ?? "").split("\n")[0].replace(/^["“']+|["”']+$/g, ""), 280);
  } catch (err) {
    return aiErrorResponse(err, "The bot couldn't think of anything. Try again.");
  }

  if (!reply) return fail("The bot couldn't think of anything. Try again.", 502);

  const { data: generationId, error: saveError } = await supabase.rpc(
    "save_chat_reply",
    {
      p_model: model,
      p_system_prompt: CHAT_SYSTEM_PROMPT,
      p_user_prompt: userPrompt,
      p_setup: message,
      p_reply: reply,
    },
  );
  if (saveError) {
    console.error("save_chat_reply failed:", saveError);
    return fail("Couldn't save the reply. Try again.", 500);
  }

  return NextResponse.json({ generationId, reply, remaining: remaining - 1 });
}
