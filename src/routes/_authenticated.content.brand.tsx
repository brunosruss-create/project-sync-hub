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

  const q = useQuery({ queryKey: ["brand-kit"], queryFn: () => getFn() });

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
  const [instagramHandle, setInstagramHandle] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");

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
    mutationFn: () => extractIgFn({ data: { handle: instagramHandle } }),
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
      toast.success(
        ex.confidence === "low"
          ? "Extração parcial — revise manualmente"
          : "Extração aplicada — confira antes de salvar",
      );
    },
    onError: () => toast.error("Falha ao extrair do Instagram"),
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
      toast.success("Extração aplicada — confira antes de salvar");
    },
    onError: () => toast.error("Falha ao extrair do site"),
  });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Extração automática */}
      <Card style={{ padding: 16 }}>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
          <Palette size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Preencher automaticamente</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Extraímos cores e logo do Instagram ou do site da sua empresa. Você pode revisar tudo
          antes de salvar.
        </p>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <div className="flex" style={{ gap: 8 }}>
            <Instagram size={16} style={{ color: "var(--text-muted)", marginTop: 8 }} />
            <input
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              placeholder="@handle_instagram"
              style={inputStyle}
            />
            <button
              onClick={() => extractIg.mutate()}
              disabled={!instagramHandle || extractIg.isPending}
              style={secondaryBtn}
            >
              {extractIg.isPending ? <Loader2 size={14} className="animate-spin" /> : "Extrair"}
            </button>
          </div>
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
              {extractSite.isPending ? <Loader2 size={14} className="animate-spin" /> : "Extrair"}
            </button>
          </div>
        </div>
      </Card>

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
