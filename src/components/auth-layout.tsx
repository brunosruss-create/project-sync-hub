import * as React from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Zap, ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div
      className="min-h-screen w-full grid lg:grid-cols-2"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* Left: form */}
      <div className="flex flex-col page-enter" style={{ padding: "32px 24px" }}>
        <Link to="/" className="inline-flex items-center gap-2">
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
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginLeft: 4,
              borderLeft: "1px solid var(--border)",
              paddingLeft: 8,
            }}
          >
            WhatsApp comercial em escala
          </span>
        </Link>

        <div className="flex-1 flex items-center justify-center" style={{ paddingTop: 32 }}>
          <div className="w-full" style={{ maxWidth: 380 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
            <div style={{ marginTop: 24 }}>{children}</div>
            {footer && (
              <p
                style={{
                  marginTop: 24,
                  fontSize: 13,
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                {footer}
              </p>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          © {new Date().getFullYear()} ZapFlow · Todos os direitos reservados
        </div>
      </div>

      {/* Right: showcase */}
      <div
        className="hidden lg:flex flex-col justify-between"
        style={{
          padding: 48,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <Sparkles size={14} style={{ color: "var(--brand-400)" }} />
          Built for sales teams that ship every day.
        </div>

        <div>
          <div
            style={{
              fontSize: 36,
              lineHeight: 1.1,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              maxWidth: 460,
            }}
          >
            Centralize, automatize e venda mais pelo WhatsApp.
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 14,
              color: "var(--text-muted)",
              maxWidth: 460,
            }}
          >
            Uma plataforma para times de vendas e atendimento gerenciarem
            conversas, fluxos e métricas em tempo real.
          </div>

          <div className="grid gap-2" style={{ marginTop: 32, maxWidth: 460 }}>
            {[
              { icon: MessageSquare, label: "Inbox compartilhada com atribuição automática" },
              { icon: Zap, label: "Automações sem código com triggers e webhooks" },
              { icon: ShieldCheck, label: "API oficial Meta · conformidade garantida" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3"
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-overlay)",
                  fontSize: 13,
                }}
              >
                <Icon size={16} style={{ color: "var(--brand-400)" }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
          }}
        >
          “Reduzimos o tempo de primeira resposta em 78% no primeiro mês.”
          <div style={{ marginTop: 4, color: "var(--text-primary)", fontWeight: 500 }}>
            Marina Costa · Head de Vendas, Lume
          </div>
        </div>
      </div>
    </div>
  );
}
