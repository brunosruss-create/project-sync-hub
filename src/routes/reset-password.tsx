import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { PasswordStrength, scorePassword } from "@/components/password-strength";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const pwRef = React.useRef<HTMLInputElement>(null);

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [loading, setLoading] = React.useState(false);
  const [hasSession, setHasSession] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    pwRef.current?.focus();
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const validators = {
    password: () =>
      password.length < 8
        ? "A senha precisa ter pelo menos 8 caracteres."
        : scorePassword(password) < 1
          ? "Fortaleça a senha com letras e números."
          : undefined,
    confirm: () => (confirm !== password ? "As senhas não coincidem." : undefined),
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = { password: validators.password(), confirm: validators.confirm() };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) return toast.error(error.message);
    await signOut();
    toast.success("Senha redefinida! Entre com sua nova senha.");
    navigate({ to: "/login" });
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

        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Definir nova senha
        </h1>
        <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
          Crie uma senha forte. Você sairá das outras sessões automaticamente.
        </p>

        {hasSession === false && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-overlay)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Link inválido ou expirado. Solicite um novo em{" "}
            <Link to="/forgot-password" style={{ color: "var(--brand-400)" }}>
              recuperar senha
            </Link>
            .
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3" style={{ marginTop: 20 }} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="password" style={{ fontSize: 12 }}>
              Nova senha
            </Label>
            <PasswordInput
              ref={pwRef}
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
              Confirmar nova senha
            </Label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setErrors((p) => ({ ...p, confirm: validators.confirm() }))}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && (
              <p style={{ fontSize: 11, color: "var(--danger)" }}>{errors.confirm}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || hasSession === false}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
