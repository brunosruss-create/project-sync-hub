import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { GoogleButton } from "@/components/google-button";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const emailRef = React.useRef<HTMLInputElement>(null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    emailRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const validateEmail = () => {
    if (!email) return "Informe seu email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email inválido.";
    return undefined;
  };
  const validatePassword = () => {
    if (!password) return "Informe sua senha.";
    return undefined;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eErr = validateEmail();
    const pErr = validatePassword();
    if (eErr || pErr) {
      setErrors({ email: eErr, password: pErr });
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthLayout
      title="Entre na sua conta"
      subtitle="Acesse seu workspace ZapFlow."
      footer={
        <>
          Não tem conta?{" "}
          <Link to="/signup" style={{ color: "var(--brand-400)", fontWeight: 500 }}>
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
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
            onBlur={() => setErrors((p) => ({ ...p, email: validateEmail() }))}
            placeholder="voce@empresa.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.email}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" style={{ fontSize: 12 }}>
              Senha
            </Label>
            <Link
              to="/forgot-password"
              style={{ fontSize: 11, color: "var(--text-muted)" }}
            >
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setErrors((p) => ({ ...p, password: validatePassword() }))}
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.password}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div
        className="flex items-center"
        style={{
          gap: 12,
          margin: "20px 0",
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        ou
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <GoogleButton label="Entrar com Google" />
    </AuthLayout>
  );
}
