import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const cookieStore = await cookies();
  const savedNext = cookieStore.get("login_next")?.value;
  let next = "/";
  try {
    next = safeNext(savedNext ? decodeURIComponent(savedNext) : null);
  } catch {
    next = "/";
  }

  const supabase = await createClient();
  let user = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  }

  // A code can only be used once. If the callback is hit again (back button,
  // double redirect) the exchange fails even though the first one signed the
  // user in, so fall back to the session cookie instead of bouncing to /login.
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) {
    const reason = code ? "auth_failed" : "missing_code";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const needsProfile = !profile?.first_name || !profile?.last_name;

  const response = NextResponse.redirect(
    `${origin}${needsProfile ? "/profile?welcome=1" : next}`,
  );
  response.cookies.delete("login_next");
  return response;
}
