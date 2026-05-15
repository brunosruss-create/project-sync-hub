import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import {
  SettingsLayout,
  FieldGroup,
  Field,
  inputStyle,
  buttonPrimary,
  buttonSecondary,
} from "@/features/settings/settings-layout";
import { useAuth } from "@/hooks/use-auth";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updatePassword } = useAuth();
  const qc = useQueryClient();
  const isOAuth = !!user?.app_metadata?.provider && user.app_metadata.provider !== "email";

  const getMyProfileFn = useServerFn(getMyProfile);
  const updateMyProfileFn = useServerFn(updateMyProfile);

  const profileQ = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfileFn(),
  });

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [language, setLanguage] = React.useState("pt-BR");
  const [tz, setTz] = React.useState("America/Sao_Paulo");
  const [notifyEmail, setNotifyEmail] = React.useState(true);
  const [notifyPush, setNotifyPush] = React.useState(true);
  const [showPwd, setShowPwd] = React.useState(false);
  const [pwd1, setPwd1] = React.useState("");
  const [pwd2, setPwd2] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pwdSaving, setPwdSaving] = React.useState(false);

  React.useEffect(() => {
    const p = profileQ.data?.profile as
      | {
          full_name?: string | null;
          phone?: string | null;
          user_timezone?: string | null;
          notify_email?: boolean | null;
          notify_push?: boolean | null;
          avatar_url?: string | null;
        }
      | null
      | undefined;
    if (!p) return;
    setName(p.full_name ?? "");
    setPhone(p.phone ?? "");
    setTz(p.user_timezone ?? "America/Sao_Paulo");
    setNotifyEmail(p.notify_email ?? true);
    setNotifyPush(p.notify_push ?? true);
  }, [profileQ.data]);

  const avatarUrl = profileQ.data?.profile?.avatar_url ?? null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe seu nome");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfileFn({
        data: {
          full_name: name.trim(),
          phone: phone.trim() || null,
          user_timezone: tz,
          notify_email: notifyEmail,
          notify_push: notifyPush,
        },
      });
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Perfil atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (pwd1.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    if (pwd1 !== pwd2) {
      toast.error("As senhas não coincidem");
      return;
    }
    setPwdSaving(true);
    const { error } = await updatePassword(pwd1);
    setPwdSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPwd1("");
    setPwd2("");
    setShowPwd(false);
    toast.success("Senha atualizada");
  };

  const initials = (name || user?.email || "U").charAt(0).toUpperCase();

  return (
    <SettingsLayout
      title="Perfil"
      description="Gerencie suas informações pessoais e preferências."
      footer={
        <>
          <button
            style={buttonSecondary}
            onClick={() => {
              profileQ.refetch();
              toast("Alterações descartadas");
            }}
          >
            Cancelar
          </button>
          <button style={buttonPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      <FieldGroup label="Foto">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                objectFit: "cover",
                border: "1px solid var(--border)",
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                background: "var(--bg-overlay)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              {initials}
            </div>
          )}
          <button
            style={buttonSecondary}
            onClick={() => toast("Upload de avatar em breve")}
            className="flex items-center gap-2"
          >
            <Camera size={14} /> Trocar foto
          </button>
        </div>
      </FieldGroup>

      <FieldGroup label="Informações pessoais">
        <Field label="Nome completo">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" hint={isOAuth ? "Email gerenciado pelo provedor OAuth" : undefined}>
          <input
            style={{ ...inputStyle, opacity: isOAuth ? 0.6 : 1 }}
            value={user?.email ?? ""}
            readOnly
          />
        </Field>
        <Field label="Telefone">
          <input
            style={inputStyle}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </Field>
      </FieldGroup>

      <FieldGroup label="Segurança">
        <button
          type="button"
          style={buttonSecondary}
          onClick={() => setShowPwd((v) => !v)}
        >
          {showPwd ? "Ocultar troca de senha" : "Trocar senha"}
        </button>
        {showPwd && (
          <div className="flex flex-col" style={{ gap: 12, marginTop: 8 }}>
            <Field label="Nova senha">
              <input
                style={inputStyle}
                type="password"
                value={pwd1}
                onChange={(e) => setPwd1(e.target.value)}
              />
            </Field>
            <Field label="Confirmar nova senha">
              <input
                style={inputStyle}
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
              />
            </Field>
            <button
              style={{ ...buttonPrimary, alignSelf: "flex-start" }}
              onClick={handlePasswordUpdate}
              disabled={pwdSaving}
            >
              {pwdSaving ? "Atualizando…" : "Atualizar senha"}
            </button>
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="Preferências">
        <Field label="Idioma" hint="Em breve — interface ainda só em PT-BR.">
          <select style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </Field>
        <Field label="Fuso horário">
          <select style={inputStyle} value={tz} onChange={(e) => setTz(e.target.value)}>
            <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
            <option value="America/Manaus">America/Manaus (GMT-4)</option>
            <option value="America/Belem">America/Belem (GMT-3)</option>
            <option value="Europe/Lisbon">Europe/Lisbon</option>
          </select>
        </Field>
        <Field label="Notificações">
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
              />
              Email
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={notifyPush}
                onChange={(e) => setNotifyPush(e.target.checked)}
              />
              Push (navegador)
            </label>
          </div>
        </Field>
      </FieldGroup>
    </SettingsLayout>
  );
}
