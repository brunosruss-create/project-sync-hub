import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/google-button";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 page-enter"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 380,
          padding: 28,
          borderRadius: 12,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <Link to="/" className="inline-flex items-center gap-2" style={{ marginBottom: 20 }}>
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "var(--brand-400)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Z
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>ZapFlow</span>
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Entre na sua conta
        </h1>
        <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
          Use seu email ou continue com o Google.
        </p>

        <form onSubmit={onSubmit} className="space-y-3" style={{ marginTop: 20 }}>
          <div className="space-y-1.5">
            <Label htmlFor="email" style={{ fontSize: 12 }}>Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="voce@empresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" style={{ fontSize: 12 }}>Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <div
          className="flex items-center"
          style={{ gap: 12, margin: "20px 0", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          ou
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        <GoogleButton label="Continuar com Google" />

        <p style={{ marginTop: 24, fontSize: 13, textAlign: "center", color: "var(--text-muted)" }}>
          Não tem conta?{" "}
          <Link to="/signup" style={{ color: "var(--brand-400)", fontWeight: 500 }}>
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
