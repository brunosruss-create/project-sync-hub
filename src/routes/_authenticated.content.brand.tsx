import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Palette, Instagram, Globe, Save, Loader2 } from "lucide-react";
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

  // Handle do Instagram já conectado (evita pedir @ manual).
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
    primaryColor: "#0EA5E9",
    secondaryColor: "#1E293B",
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
      toast.success("Brand Kit salvo");
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
        toast.success("Identidade da marca aplicada do seu Instagram");
      }
    },
    onError: () => {
      // Falha silenciosa — usuário pode preencher manualmente sem ser avisado
      // que houve uma tentativa automática.
    },
  });

  // Auto-extração silenciosa: quando abre a página e existe Instagram conectado,
  // roda uma vez pra pré-preencher cores/logo. Se falhar, o usuário nem percebe.
  React.useEffect(() => {
    if (autoExtracted) return;
    if (!q.data) return;
    if (q.data.brandKit) {
      // Já tem Brand Kit salvo — não sobrescreve.
      setAutoExtracted(true);
      return;
    }
    if (!instagramHandleAuto) return;
    setAutoExtracted(true);
    extractIg.mutate(instagramHandleAuto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, instagramHandleAuto]);

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
      toast.success("Extração aplicada — confira antes de salvar");
    },
    onError: () => toast.error("Falha ao extrair do site"),
  });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Painel informativo — instagram conectado */}
      {connectedInstagram ? (
        <Card style={{ padding: 14 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <Instagram size={18} style={{ color: "var(--accent)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Conectado como @{instagramHandleAuto}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Cores e identidade são detectadas automaticamente do seu Instagram. Ajuste
                abaixo se quiser sobrescrever.
              </div>
            </div>
            <button
              onClick={() => extractIg.mutate(instagramHandleAuto)}
              disabled={extractIg.isPending}
              style={secondaryBtn}
            >
              {extractIg.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Reanalisar"
              )}
            </button>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 16 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <Palette size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Detectar identidade automaticamente</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            Informe o site da sua empresa. Vamos extrair cores e logo pra você.
          </p>
          <div className="flex" style={{ gap: 8 }}>
            <Globe size={16} style={{ color: "var(--text-muted)", marginTop: 8 }} />
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://seusite.com.br"
              style={inputStyle}
            />
            <button
              onClick={() => extractSite.mutate()}
              disabled={!websiteUrl || extractSite.isPending}
              style={secondaryBtn}
            >
              {extractSite.isPending ? <Loader2 size={14} className="animate-spin" /> : "Detectar"}
            </button>
          </div>
        </Card>
      )}

      {/* Cores */}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Cores da marca</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Tipografia</div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Fonte de destaque</label>
            <select
              value={form.displayFont}
              onChange={(e) => setForm((f) => ({ ...f, displayFont: e.target.value }))}
              style={inputStyle}
            >
              {DISPLAY_FONTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Fonte de texto</label>
            <select
              value={form.bodyFont}
              onChange={(e) => setForm((f) => ({ ...f, bodyFont: e.target.value }))}
              style={inputStyle}
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

      {/* Identidade verbal */}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Identidade verbal</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Tom de voz</label>
          <input
            value={form.toneOfVoice}
            onChange={(e) => setForm((f) => ({ ...f, toneOfVoice: e.target.value }))}
            placeholder="Ex: profissional e acolhedor"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Assinatura padrão</label>
          <input
            value={form.defaultSignature}
            onChange={(e) => setForm((f) => ({ ...f, defaultSignature: e.target.value }))}
            placeholder="Nome da sua marca"
            style={inputStyle}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={primaryBtn}
        >
          {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
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
      <label style={labelStyle}>{label}</label>
      <div className="flex items-center" style={{ gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 36, border: "none", padding: 0, background: "transparent" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, textTransform: "uppercase", fontFamily: "monospace" }}
        />
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 20px",
  borderRadius: "var(--radius-pill)",
  background: "var(--accent)",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: "var(--radius-pill)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid var(--border)",
  cursor: "pointer",
};
