import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/dashboard" });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/dashboard" });
    });

    const timeout = setTimeout(() => navigate({ to: "/login" }), 5000);

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
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Finalizando login…</p>
    </div>
  );
}
