import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { MessageSquare, Users, TrendingUp, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const stats = [
  { label: "Conversas hoje", value: "0", delta: "—", icon: MessageSquare },
  { label: "Contatos ativos", value: "0", delta: "—", icon: Users },
  { label: "Taxa de resposta", value: "—", delta: "—", icon: TrendingUp },
  { label: "Tempo médio", value: "—", delta: "—", icon: Clock },
];

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "ali";

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Olá, {displayName}
        </h1>
        <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
          Aqui está o resumo do seu workspace.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, delta, icon: Icon }) => (
          <div
            key={label}
            style={{
              padding: 16,
              borderRadius: 8,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
              <Icon size={14} style={{ color: "var(--text-muted)" }} />
            </div>
            <div style={{ marginTop: 12, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {value}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>{delta}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 8,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Próximos passos</div>
        <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
          Conecte seu número WhatsApp e importe seus contatos para começar.
        </p>
        <div className="flex flex-wrap" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn-primary">Conectar WhatsApp</button>
          <button
            type="button"
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Importar contatos
          </button>
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }}>user_id:</span>{" "}
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
          {user?.id}
        </span>
        {" · "}
        <span style={{ fontFamily: "var(--font-mono)" }}>provider:</span>{" "}
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
          {user?.app_metadata?.provider || "email"}
        </span>
      </div>
    </div>
  );
}
