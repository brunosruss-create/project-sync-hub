import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Palette, Wand2, Images } from "lucide-react";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentLayout,
});

function ContentLayout() {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header contextualizado dentro de Publicações */}
      <div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <Link
            to="/social/accounts"
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            Publicações
          </Link>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>›</span>
          <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>
            Conteúdo com IA
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em", marginTop: 4 }}>
          Gerar posts com IA
        </h1>
        <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
          Descreva o que quer comunicar. A IA monta imagem + legenda + hashtags — você revisa
          no compositor de Publicações e publica.
        </p>
      </div>

      {/* Sub-nav — Templates é interno, não aparece pro cliente */}
      <div
        className="flex flex-wrap"
        style={{ gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}
      >
        <NavPill to="/content/compose" icon={<Wand2 size={14} />} label="Criar post" />
        <NavPill to="/content/assets" icon={<Images size={14} />} label="Posts gerados" />
        <NavPill to="/content/brand" icon={<Palette size={14} />} label="Identidade visual" />
      </div>

      <Outlet />
    </div>
  );
}

function NavPill({
  to,
  label,
  icon,
  exact = false,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        color: "var(--text-muted)",
        border: "1px solid transparent",
      }}
      activeProps={{
        style: {
          background: "var(--surface-2)",
          color: "var(--text)",
          border: "1px solid var(--border)",
        },
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
