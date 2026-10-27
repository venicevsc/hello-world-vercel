import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/venice-style";

// A hung model gets at most this long; quota errors come back instantly.
const ATTEMPT_TIMEOUT_MS = 25_000;
// All attempts together must finish inside a route's 60s maxDuration.
const TOTAL_BUDGET_MS = 50_000;
const MIN_ATTEMPT_MS = 5_000;

type CreateParams = Parameters<GoogleGenAI["interactions"]["create"]>[0];

export function statusOf(err: unknown) {
  return typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: number }).status
    : undefined;
}

// The models to try, in order, as managed in the admin panel (LLM models:
// active, fallback order). Only if the lookup itself fails does the built-in
// list keep captions working. An empty list means an admin switched them all off.
export async function activeModels(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("active_llm_models");
  if (error || !Array.isArray(data)) return MODELS;
  return data.filter((m): m is string => typeof m === "string" && m.length > 0);
}

// Runs one request against each model in turn until one answers.
export async function createWithFallback(
  apiKey: string,
  params: Omit<CreateParams, "model" | "store">,
  models: string[] = MODELS,
) {
  const ai = new GoogleGenAI({ apiKey });
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: unknown = new Error("No models configured.");

  for (const model of models) {
    const timeLeft = deadline - Date.now();
    if (timeLeft < MIN_ATTEMPT_MS) break;
    try {
      const interaction = await ai.interactions.create(
        { ...params, model, store: false } as CreateParams,
        { timeout: Math.min(ATTEMPT_TIMEOUT_MS, timeLeft), maxRetries: 0 },
      );
      return { model, text: "output_text" in interaction ? interaction.output_text : undefined };
    } catch (err) {
      // Only overload, quota/rate limits and timeouts are worth trying the next model for.
      const status = statusOf(err);
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable) throw err;
      console.warn(`Gemini ${model} failed (${status ?? "timeout"}), trying next model`);
      lastError = err;
    }
  }
  throw lastError;
}

export function aiErrorResponse(err: unknown, fallbackMessage: string) {
  const status = statusOf(err);
  const fail = (error: string, code: number) =>
    NextResponse.json({ error }, { status: code });
  if (status === 429) {
    return fail(
      "The AI has hit its free usage limit. Try again in a few minutes, or tomorrow if it keeps happening.",
      503,
    );
  }
  if (status === 503) {
    return fail("The AI is overloaded right now. Try again in a minute.", 503);
  }
  if (status === undefined && !(err instanceof SyntaxError)) {
    return fail("The AI took too long to answer. Try again in a minute.", 504);
  }
  console.error("Gemini request failed:", err);
  return fail(fallbackMessage, 502);
}
