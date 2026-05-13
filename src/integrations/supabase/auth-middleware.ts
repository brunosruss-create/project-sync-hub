import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://xrezmnaspkctuidehqqi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    // attach the current user's bearer token to the server-fn request
    let token: string | null = null;
    try {
      const { data } = await browserSupabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {}
    return next(
      token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
    );
  })
  .server(async ({ next }) => {
    const auth = getRequestHeader("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        user: data.user,
      },
    });
  });
