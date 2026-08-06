import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Instagram, Globe, Save, Loader2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  getBrandKit,
  upsertBrandKit,
  extractBrandFromInstagram,
  extractBrandFromWebsite,
} from "@/lib/brand-kit.functions";
import { listSocialAccounts } from "@/lib/social-publishing.functions";
import {
  DISPLAY_FONTS,
  BODY_FONTS,
  SCRIPT_FONTS,
} from "@/features/content-generation/fonts/whitelist";

export const Route = createFileRoute("/_authenticated/content/brand")({
  component: BrandKitPage,
});

function BrandKitPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getBrandKit);
  const saveFn = useServerFn(upsertBrandKit);
  const extractIgFn = useServerFn(extractBrandFromInstagram);
  const extractSiteFn = useServerFn(extractBrandFromWebsite);
  const accountsFn = useServerFn(listSocialAccounts);

  const q = useQuery({ queryKey: ["brand-kit"], queryFn: () => getFn() });
  const accountsQ = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => accountsFn(),
  });

  const connectedInstagram = React.useMemo(() => {
    const accounts = accountsQ.data?.accounts ?? [];
    return (
      accounts.find(
        (a: any) => a.platform === "instagram" && a.status === "connected",
      ) ?? null
    );
  }, [accountsQ.data]);
  const instagramHandleAuto = (connectedInstagram as any)?.account_name ?? "";

  const [form, setForm] = React.useState({
    primaryColor: "#3654FF",
    secondaryColor: "#141412",
    supportColor: "#F59E0B",
    logoUrl: "",
    displayFont: "Playfair Display" as string,
    bodyFont: "Inter" as string,
    toneOfVoice: "profissional",
    defaultSignature: "",
  });
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [autoExtracted, setAutoExtracted] = React.useState(false);

  React.useEffect(() => {
    const bk = q.data?.brandKit;
    if (bk) {
      setForm({
        primaryColor: bk.primaryColor,
        secondaryColor: bk.secondaryColor,
        supportColor: bk.supportColor,
        logoUrl: bk.logoUrl ?? "",
        displayFont: bk.displayFont,
        bodyFont: bk.bodyFont,
        toneOfVoice: bk.toneOfVoice,
        defaultSignature: bk.defaultSignature,
      });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          supportColor: form.supportColor,
          logoUrl: form.logoUrl || undefined,
          displayFont: form.displayFont as any,
          bodyFont: form.bodyFont as any,
          toneOfVoice: form.toneOfVoice,
          defaultSignature: form.defaultSignature,
          extractionSource: "manual",
        },
      }),
    onSuccess: () => {
      toast.success("Identidade salva");
      qc.invalidateQueries({ queryKey: ["brand-kit"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const extractIg = useMutation({
    mutationFn: (handle: string) => extractIgFn({ data: { handle } }),
    onSuccess: (r: any) => {
      const ex = r?.extraction;
      if (!ex) return;
      setForm((f) => ({
        ...f,
        primaryColor: ex.primaryColor ?? f.primaryColor,
        secondaryColor: ex.secondaryColor ?? f.secondaryColor,
        supportColor: ex.supportColor ?? f.supportColor,
        logoUrl: ex.logoUrl ?? f.logoUrl,
      }));
      if (ex.confidence !== "low") {
        toast.success("Cores extraídas do seu Instagram");
      }
    },
    onError: () => {
      // silencioso
    },
  });

  const extractSite = useMutation({
    mutationFn: () => extractSiteFn({ data: { url: websiteUrl } }),
    onSuccess: (r: any) => {
      const ex = r?.extraction;
      if (!ex) return;
      setForm((f) => ({
        ...f,
        primaryColor: ex.primaryColor ?? f.primaryColor,
        secondaryColor: ex.secondaryColor ?? f.secondaryColor,
        supportColor: ex.supportColor ?? f.supportColor,
        logoUrl: ex.logoUrl ?? f.logoUrl,
      }));
      toast.success("Cores extraídas do site");
    },
    onError: () => toast.error("Falha ao extrair do site"),
  });

  // Auto-extração silenciosa quando Brand Kit vazio + IG conectado.
  React.useEffect(() => {
    if (autoExtracted) return;
    if (!q.data) return;
    if (q.data.brandKit) {
      setAutoExtracted(true);
      return;
    }
    if (!instagramHandleAuto) return;
    setAutoExtracted(true);
    extractIg.mutate(instagramHandleAuto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, instagramHandleAuto]);

  return (
    <div className="flex flex-col" style={{ gap: 14, maxWidth: 760 }}>
      {/* Estado: IG conectado */}
      {connectedInstagram ? (
        <Card style={{ padding: 16 }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-pill)",
                background: "color-mix(in oklab, var(--brand-400) 14%, transparent)",
                color: "var(--brand-400)",
              }}
            >
              <Instagram size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  @{instagramHandleAuto}
                </span>
                <span
                  className="inline-flex items-center"
                  style={{
                    gap: 4,
                    fontSize: 11,
                    color: "var(--success, #059669)",
                  }}
                >
                  <Check size={12} />
                  conectado
                </span>
              </div>
              <div
                style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}
              >
                Cores e logo detectados automaticamente do seu perfil. Ajuste
                abaixo se quiser.
              </div>
            </div>
            <button
              onClick={() => extractIg.mutate(instagramHandleAuto)}
              disabled={extractIg.isPending}
              style={secondaryBtn}
            >
              {extractIg.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                "Reanalisar"
              )}
            </button>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 20 }}>
          <div style={sectionLabel}>Detectar identidade automaticamente</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            Informe o site da sua empresa que extraímos cores e logo pra você.
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <div
              className="flex items-center"
              style={{ paddingLeft: 4, color: "var(--text-muted)" }}
            >
              <Globe size={16} />
            </div>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://seusite.com.br"
              style={{ ...input, flex: 1 }}
            />
            <button
              onClick={() => extractSite.mutate()}
              disabled={!websiteUrl || extractSite.isPending}
              style={secondaryBtn}
            >
              {extractSite.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                "Detectar"
              )}
            </button>
          </div>
        </Card>
      )}

      {/* Cores */}
      <Card style={{ padding: 20 }}>
        <div style={sectionLabel}>Cores da marca</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <ColorField
            label="Primária"
            value={form.primaryColor}
            onChange={(v) => setForm((f) => ({ ...f, primaryColor: v }))}
          />
          <ColorField
            label="Secundária"
            value={form.secondaryColor}
            onChange={(v) => setForm((f) => ({ ...f, secondaryColor: v }))}
          />
          <ColorField
            label="Apoio"
            value={form.supportColor}
            onChange={(v) => setForm((f) => ({ ...f, supportColor: v }))}
          />
        </div>
      </Card>

      {/* Tipografia */}
      <Card style={{ padding: 20 }}>
        <div style={sectionLabel}>Tipografia</div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={fieldLabel}>Fonte de destaque</label>
            <select
              value={form.displayFont}
              onChange={(e) => setForm((f) => ({ ...f, displayFont: e.target.value }))}
              style={input}
            >
              {DISPLAY_FONTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Fonte de texto</label>
            <select
              value={form.bodyFont}
              onChange={(e) => setForm((f) => ({ ...f, bodyFont: e.target.value }))}
              style={input}
            >
              <optgroup label="Corpo">
                {BODY_FONTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Manuscritas">
                {SCRIPT_FONTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
      </Card>

      {/* Identidade verbal — puxada do workspace, editável aqui como override */}
      <Card style={{ padding: 20 }}>
        <div style={sectionLabel}>Assinatura nos posts</div>
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Nome que aparece nos posts</label>
          <input
            value={form.defaultSignature}
            onChange={(e) => setForm((f) => ({ ...f, defaultSignature: e.target.value }))}
            placeholder="Nome da sua marca"
            style={input}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Puxado do nome do negócio nas Configurações. Edite aqui se quiser diferente.
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="btn-primary"
          style={{ height: 38, padding: "0 22px", fontSize: 13 }}
        >
          {save.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          Salvar
        </button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <div className="flex items-center" style={{ gap: 8 }}>
        <label
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--border-strong)",
            background: value,
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              cursor: "pointer",
            }}
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...input,
            flex: 1,
            textTransform: "uppercase",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
          }}
        />
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 12,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  borderRadius: "var(--radius-pill)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid var(--border-strong)",
  cursor: "pointer",
  flexShrink: 0,
};
