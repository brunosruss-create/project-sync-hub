import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const isOAuth = !!user?.app_metadata?.provider && user.app_metadata.provider !== "email";

  const [name, setName] = React.useState(profile?.full_name ?? "");
  const [phone, setPhone] = React.useState("");
  const [language, setLanguage] = React.useState("pt-BR");
  const [tz, setTz] = React.useState("America/Sao_Paulo");
  const [notifyEmail, setNotifyEmail] = React.useState(true);
  const [notifyPush, setNotifyPush] = React.useState(true);
  const [showPwd, setShowPwd] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (profile?.full_name) setName(profile.full_name);
  }, [profile?.full_name]);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Perfil atualizado");
  };

  const initials = (name || user?.email || "U").charAt(0).toUpperCase();

  return (
    <SettingsLayout
      title="Perfil"
      description="Gerencie suas informações pessoais e preferências."
      footer={
        <>
          <button style={buttonSecondary} onClick={() => toast("Alterações descartadas")}>
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
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
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
            readOnly={isOAuth}
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
            <Field label="Senha atual">
              <input style={inputStyle} type="password" />
            </Field>
            <Field label="Nova senha">
              <input style={inputStyle} type="password" />
            </Field>
            <Field label="Confirmar nova senha">
              <input style={inputStyle} type="password" />
            </Field>
            <button
              style={{ ...buttonPrimary, alignSelf: "flex-start" }}
              onClick={() => toast.success("Senha atualizada")}
            >
              Atualizar senha
            </button>
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="Preferências">
        <Field label="Idioma">
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
