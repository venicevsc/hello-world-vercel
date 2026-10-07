import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { MODEL, SYSTEM_PROMPT, buildUserPrompt } from "@/lib/venice-style";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ANGLES = new Set(["photo", "name", "both"]);

const captionSchema = {
  type: "object",
  properties: {
    captions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string", enum: ["photo", "name", "both"] },
          text: { type: "string" },
        },
        required: ["angle", "text"],
      },
    },
  },
  required: ["captions"],
};

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail("Caption generation isn't configured yet.", 500);

  let body: { path?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Log in to generate captions.", 401);

  const path = typeof body.path === "string" ? body.path : "";
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
    return fail("Invalid photo.", 400);
  }

  const context =
    typeof body.context === "string" && body.context.trim()
      ? body.context.replace(/\s+/g, " ").trim().slice(0, 200)
      : null;

  const { data: remaining, error: remainingError } = await supabase.rpc(
    "generations_remaining",
  );
  if (remainingError) return fail("Couldn't check your daily limit.", 500);
  if (!remaining || remaining <= 0) {
    return fail(
      "You've used all 10 generations for today. Come back tomorrow, or go vote on other people's captions.",
      429,
    );
  }

  const imageUrl = supabase.storage.from("photos").getPublicUrl(path).data
    .publicUrl;
  const imageRes = await fetch(imageUrl);
  const mimeType = imageRes.headers.get("content-type")?.split(";")[0] ?? "";
  if (!imageRes.ok || !ALLOWED_TYPES.has(mimeType)) {
    return fail("Couldn't read the uploaded photo.", 400);
  }
  const imageBytes = Buffer.from(await imageRes.arrayBuffer());
  if (imageBytes.length > MAX_IMAGE_BYTES) {
    return fail("That photo is too large.", 400);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, hometown")
    .eq("id", user.id)
    .maybeSingle();

  const userPrompt = buildUserPrompt({
    firstName: profile?.first_name ?? null,
    hometown: profile?.hometown ?? null,
    context,
  });

  let captions: { angle: string; text: string }[];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: MODEL,
      system_instruction: SYSTEM_PROMPT,
      input: [
        { type: "text", text: userPrompt },
        {
          type: "image",
          data: imageBytes.toString("base64"),
          mime_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: captionSchema,
      },
      store: false,
    });

    const raw = interaction.output_text;
    if (!raw) {
      return fail("The AI couldn't caption that photo. Try a different one.", 422);
    }

    const parsed = JSON.parse(raw) as {
      captions?: { angle?: unknown; text?: unknown }[];
    };
    captions = (parsed.captions ?? [])
      .filter(
        (c): c is { angle: string; text: string } =>
          typeof c.angle === "string" &&
          ANGLES.has(c.angle) &&
          typeof c.text === "string" &&
          c.text.trim().length > 0,
      )
      .slice(0, 3)
      .map((c) => ({ angle: c.angle, text: c.text.trim().slice(0, 280) }));
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    if (status === 429) {
      return fail("The AI is rate limited right now. Try again in a minute.", 429);
    }
    console.error("Gemini request failed:", err);
    return fail("The AI couldn't generate captions. Try again.", 502);
  }

  if (captions.length === 0) {
    return fail("The AI returned nothing usable. Try again.", 502);
  }

  const { data: photoId, error: saveError } = await supabase.rpc(
    "save_generation",
    {
      p_image_url: imageUrl,
      p_alt_text: context ?? "",
      p_model: MODEL,
      p_system_prompt: SYSTEM_PROMPT,
      p_user_prompt: userPrompt,
      p_context: context ?? "",
      p_captions: captions,
    },
  );
  if (saveError) {
    console.error("save_generation failed:", saveError);
    return fail("Couldn't save your captions. Try again.", 500);
  }

  return NextResponse.json({
    photoId,
    imageUrl,
    captions,
    remaining: remaining - 1,
  });
}
