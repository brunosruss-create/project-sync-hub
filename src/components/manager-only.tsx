import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-role";

/**
 * Wrap pages that should only be accessible to managers.
 * Agents are redirected to /inbox with a toast.
 */
export function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { isAgent, loading } = useRole();
  const navigate = useNavigate();
  const notified = React.useRef(false);

  React.useEffect(() => {
    if (loading) return;
    if (isAgent && !notified.current) {
      notified.current = true;
      toast.error("Acesso restrito", {
        description: "Apenas managers podem acessar esta área.",
      });
      navigate({ to: "/inbox" });
    }
  }, [isAgent, loading, navigate]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: 200, fontSize: 13, color: "var(--text-muted)" }}
      >
        Carregando…
      </div>
    );
  }
  if (isAgent) return null;
  return <>{children}</>;
}
