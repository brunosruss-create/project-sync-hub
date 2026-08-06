import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { completeSocialConnect } from "@/lib/social-publishing.functions";

export const Route = createFileRoute("/social/callback")({
  component: SocialCallback,
});

// Retorno do OAuth da Zernio para o módulo de publicação (isolado do de
// mensageria — ver zernio-callback.tsx). A Zernio redireciona o browser
// autenticado pra cá com:
//   ?connected=<platform>&profileId=...&accountId=...&username=...
// Persistimos a conexão via server fn e voltamos pra /social/accounts.
function SocialCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = React.useState("Finalizando conexão…");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const platform = qs.get("connected");
    const accountId = qs.get("accountId");
    const profileId = qs.get("profileId");
    const username = qs.get("username") ?? undefined;

    const go = (to: string) => setTimeout(() => navigate({ to }), 1200);

    const valid =
      platform === "facebook" ||
      platform === "instagram" ||
      platform === "tiktok" ||
      platform === "youtube";

    if (!valid || !accountId || !profileId) {
      const err = qs.get("error") ?? qs.get("error_description");
      toast.error(err ? `Conexão não concluída: ${err}` : "Conexão não concluída.");
      setMsg("Não foi possível conectar. Redirecionando…");
      go("/social/accounts");
      return;
    }

    completeSocialConnect({
      data: {
        platform: platform as "facebook" | "instagram" | "tiktok" | "youtube",
        accountId,
        profileId,
        username,
      },
    })
      .then(() => {
        toast.success("Conta conectada.");
        setMsg("Conectado! Redirecionando…");
        go("/social/accounts");
      })
      .catch((e: any) => {
        toast.error(`Falha ao salvar conexão: ${e?.message ?? e}`);
        setMsg("Falha ao salvar. Redirecionando…");
        go("/social/accounts");
      });
  }, [navigate]);

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--bg-base)" }}
    >
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{msg}</p>
    </div>
  );
}
