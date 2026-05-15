import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { CommandPalette } from "@/components/command-palette";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_blocked")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.is_blocked) {
        toast.error("Sua conta foi bloqueada por um administrador.");
        await signOut();
        navigate({ to: "/login" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, signOut, navigate]);

  if (loading || !user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Carregando…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full" style={{ background: "var(--bg-base)" }}>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar />
        <main
          className="flex-1 overflow-y-auto"
          style={{ padding: 24, background: "var(--bg-base)" }}
        >
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
