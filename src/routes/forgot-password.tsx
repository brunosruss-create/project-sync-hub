import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const emailRef = React.useRef<HTMLInputElement>(null);

  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const validate = () => {
    if (!email) return "Informe seu email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email inválido.";
    return undefined;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) return setError(err);
    setLoading(true);
    const { error: apiError } = await requestPasswordReset(email);
    setLoading(false);
    if (apiError) return toast.error(apiError.message);
    setSent(true);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 page-enter"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 400,
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

        {sent ? (
          <div>
            <div
              className="inline-flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: "color-mix(in oklab, var(--brand-400) 15%, transparent)",
                color: "var(--brand-400)",
                marginBottom: 16,
              }}
            >
              <Mail size={18} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Verifique seu email
            </h1>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Enviamos um link de recuperação para{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{email}</span>.
              Abra a mensagem e clique no link para definir uma nova senha. O link expira em 60 minutos.
            </p>

            <div className="flex flex-col gap-2" style={{ marginTop: 20 }}>
              <Button
                variant="outline"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Enviar para outro email
              </Button>
              <Button asChild variant="ghost">
                <Link to="/login">
                  <ArrowLeft size={14} />
                  Voltar para o login
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Recuperar senha
            </h1>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
              Informe seu email e enviaremos um link para você redefinir sua senha.
            </p>

            <form onSubmit={onSubmit} className="space-y-3" style={{ marginTop: 20 }} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" style={{ fontSize: 12 }}>
                  Email
                </Label>
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setError(validate())}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  aria-invalid={!!error}
                />
                {error && <p style={{ fontSize: 11, color: "var(--danger)" }}>{error}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? "Enviando..." : "Enviar link de recuperação"}
              </Button>
            </form>

            <p style={{ marginTop: 20, fontSize: 13, textAlign: "center", color: "var(--text-muted)" }}>
              Lembrou sua senha?{" "}
              <Link to="/login" style={{ color: "var(--brand-400)", fontWeight: 500 }}>
                Entrar
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
