import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Palette, LayoutTemplate, Wand2, Images, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentLayout,
});

function ContentLayout() {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Conteúdo IA
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            Crie posts profissionais em cliques — imagem + legenda + hashtags gerados por IA.
          </p>
        </div>
      </div>

      {/* Sub-nav */}
      <div
        className="flex flex-wrap"
        style={{ gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}
      >
        <NavPill to="/content" icon={<Wand2 size={14} />} label="Início" exact />
        <NavPill to="/content/compose" icon={<Wand2 size={14} />} label="Criar post" />
        <NavPill to="/content/assets" icon={<Images size={14} />} label="Posts" />
        <NavPill to="/content/brand" icon={<Palette size={14} />} label="Brand Kit" />
        <NavPill to="/content/templates" icon={<LayoutTemplate size={14} />} label="Templates" />
        <NavPill to="/content/permissions" icon={<ShieldCheck size={14} />} label="Permissões" />
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
