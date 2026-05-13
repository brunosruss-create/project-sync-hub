import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    // attach the current user's bearer token to the server-fn request
    let token: string | null = null;
    try {
      const { supabase: browserSupabase } = await import("@/integrations/supabase/client");
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase: supabaseAdmin,
        userId: data.user.id,
        user: data.user,
      },
    });
  });
