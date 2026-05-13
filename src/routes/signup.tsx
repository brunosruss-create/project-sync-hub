import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { PasswordStrength, scorePassword } from "@/components/password-strength";
import { GoogleButton } from "@/components/google-button";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

type Errors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
};

function SignupPage() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const nameRef = React.useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [terms, setTerms] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    nameRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const validators = {
    fullName: () => (fullName.trim().length < 2 ? "Informe seu nome completo." : undefined),
    email: () =>
      !email
        ? "Informe seu email."
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? "Email inválido."
          : undefined,
    password: () =>
      password.length < 8
        ? "A senha precisa ter pelo menos 8 caracteres."
        : scorePassword(password) < 1
          ? "Use letras e números para fortalecer."
          : undefined,
    confirm: () => (confirm !== password ? "As senhas não coincidem." : undefined),
    terms: () => (!terms ? "Você precisa aceitar os termos." : undefined),
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      fullName: validators.fullName(),
      email: validators.email(),
      password: validators.password(),
      confirm: validators.confirm(),
      terms: validators.terms(),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    const { error } = await signUp(email, password, { fullName: fullName.trim() });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Verifique seu email para confirmar o cadastro.");
    navigate({ to: "/login" });
  };

  return (
    <AuthLayout
      title="Criar sua conta"
      subtitle="Comece grátis. 14 dias de trial, sem cartão."
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" style={{ color: "var(--brand-400)", fontWeight: 500 }}>
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName" style={{ fontSize: 12 }}>
            Nome completo
          </Label>
          <Input
            ref={nameRef}
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={() => setErrors((p) => ({ ...p, fullName: validators.fullName() }))}
            placeholder="Maria Silva"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
          />
          {errors.fullName && (
            <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.fullName}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" style={{ fontSize: 12 }}>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setErrors((p) => ({ ...p, email: validators.email() }))}
            placeholder="voce@empresa.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.email}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" style={{ fontSize: 12 }}>
            Senha
          </Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setErrors((p) => ({ ...p, password: validators.password() }))}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
          />
          <PasswordStrength value={password} />
          {errors.password && (
            <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.password}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm" style={{ fontSize: 12 }}>
            Confirmar senha
          </Label>
          <PasswordInput
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setErrors((p) => ({ ...p, confirm: validators.confirm() }))}
            placeholder="Repita a senha"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
          />
          {errors.confirm && (
            <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.confirm}</p>
          )}
        </div>

        <label className="flex items-start gap-2" style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => {
              setTerms(e.target.checked);
              setErrors((p) => ({ ...p, terms: undefined }));
            }}
            style={{
              marginTop: 2,
              accentColor: "var(--brand-400)",
              width: 14,
              height: 14,
            }}
          />
          <span style={{ color: "var(--text-muted)" }}>
            Aceito os{" "}
            <a
              href="#"
              style={{ color: "var(--brand-400)" }}
              onClick={(e) => e.preventDefault()}
            >
              termos de uso
            </a>{" "}
            e a{" "}
            <a
              href="#"
              style={{ color: "var(--brand-400)" }}
              onClick={(e) => e.preventDefault()}
            >
              política de privacidade
            </a>
            .
          </span>
        </label>
        {errors.terms && (
          <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.terms}</p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Criando..." : "Criar conta"}
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
      <GoogleButton label="Continuar com Google" />
    </AuthLayout>
  );
}
