import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { saveZernioConnection } from "@/lib/zernio.functions";

export const Route = createFileRoute("/zernio-callback")({
  component: ZernioCallback,
});

// Retorno do OAuth da Zernio. A Zernio redireciona o browser (usuário logado)
// pra cá com ?connected=<platform>&accountId=...&username=...
// Persistimos via server fn (bearer token do usuário) e voltamos pra Ajustes.
function ZernioCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = React.useState("Finalizando conexão…");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const platform = qs.get("connected");
    const accountId = qs.get("accountId");
    const username = qs.get("username") ?? undefined;

    const done = (to: string) =>
      setTimeout(() => navigate({ to }), 1200);

    if ((platform !== "whatsapp" && platform !== "instagram") || !accountId) {
      const err = qs.get("error") ?? qs.get("error_description");
      toast.error(err ? `Conexão não concluída: ${err}` : "Conexão não concluída.");
      setMsg("Não foi possível conectar. Redirecionando…");
      done("/settings/whatsapp");
      return;
    }

    saveZernioConnection({ data: { platform, accountId, username } })
      .then(() => {
        toast.success(
          platform === "whatsapp"
            ? "WhatsApp oficial conectado!"
            : "Instagram conectado!",
        );
        setMsg("Conectado! Redirecionando…");
        done("/settings/whatsapp");
      })
      .catch((e: any) => {
        toast.error(`Falha ao salvar conexão: ${e?.message ?? e}`);
        setMsg("Falha ao salvar. Redirecionando…");
        done("/settings/whatsapp");
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
