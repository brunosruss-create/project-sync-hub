import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  React.useEffect(() => {
    // Detect recovery flow either from query (?type=recovery) or hash (#type=recovery)
    const isRecovery = (() => {
      if (typeof window === "undefined") return false;
      if (new URLSearchParams(window.location.search).get("type") === "recovery") return true;
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      return new URLSearchParams(hash).get("type") === "recovery";
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || isRecovery) {
        navigate({ to: "/reset-password" });
        return;
      }
      if (session) navigate({ to: "/dashboard" });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isRecovery) {
        navigate({ to: "/reset-password" });
        return;
      }
      if (session) navigate({ to: "/dashboard" });
    });

    const timeout = setTimeout(() => navigate({ to: "/login" }), 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--bg-base)" }}
    >
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Finalizando…</p>
    </div>
  );
}
