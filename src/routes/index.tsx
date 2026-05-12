import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MessageSquare, Zap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      <header style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between" style={{ padding: "14px 24px" }}>
          <Link to="/" className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "var(--brand-400)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Z
            </span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>ZapFlow</span>
          </Link>
          <nav className="flex items-center" style={{ gap: 6 }}>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Começar grátis</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl page-enter" style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 720 }}>
          <span
            className="inline-flex items-center"
            style={{
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--brand-400)",
              }}
            />
            Em construção · early access
          </span>
          <h1
            style={{
              marginTop: 24,
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 600,
            }}
          >
            O sistema operacional do seu WhatsApp comercial.
          </h1>
          <p
            style={{
              marginTop: 20,
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--text-muted)",
              maxWidth: 560,
            }}
          >
            Centralize conversas, automatize fluxos e meça resultados. Construído para times que vendem todos os dias.
          </p>
          <div className="flex flex-wrap" style={{ marginTop: 32, gap: 8 }}>
            <Button asChild>
              <Link to="/signup">
                Começar grátis <ArrowRight size={14} />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>

        <div
          className="grid gap-3 md:grid-cols-3"
          style={{ marginTop: 96 }}
        >
          {[
            { icon: MessageSquare, title: "Conversas unificadas", desc: "Times atendendo no mesmo número, sem cruzar fios." },
            { icon: Zap, title: "Automações nativas", desc: "Fluxos rápidos para qualificar, agendar e fechar." },
            { icon: ShieldCheck, title: "Conformidade Meta", desc: "API oficial. Sem banimentos, sem improviso." },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              style={{
                padding: 20,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
              }}
            >
              <Icon size={18} style={{ color: "var(--brand-400)" }} />
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>{title}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
                {desc}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
