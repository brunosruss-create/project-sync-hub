import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { submitBrief } from "@/lib/content-generation.functions";
import { getMyContentPermissions } from "@/lib/content-permissions.functions";
import {
  TEMPLATE_CATEGORIES,
  POST_FORMATS,
  TARGET_NETWORKS,
  type TemplateCategory,
  type PostFormat,
  type TargetNetwork,
} from "@/features/content-generation/types";
import { checkFormatCompatibility } from "@/features/content-generation/format-compatibility";

export const Route = createFileRoute("/_authenticated/content/compose")({
  component: ComposePage,
});

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  promo: "Promoção",
  novidade: "Novidade",
  depoimento: "Depoimento",
  agenda: "Agenda",
  dica: "Dica",
  institucional: "Institucional",
  antes_depois: "Antes/Depois",
  catalogo: "Catálogo",
};

const FORMAT_LABEL: Record<PostFormat, string> = {
  single: "Post único",
  carousel: "Carrossel",
  story: "Story / Reels",
};

const NETWORK_LABEL: Record<TargetNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function ComposePage() {
  const nav = useNavigate();
  const submitFn = useServerFn(submitBrief);
  const permsFn = useServerFn(getMyContentPermissions);
  const permsQ = useQuery({ queryKey: ["content-perms"], queryFn: () => permsFn() });
  const canAiOptin = permsQ.data?.permissions?.ai_image_optin ?? false;

  const [category, setCategory] = React.useState<TemplateCategory>("promo");
  const [format, setFormat] = React.useState<PostFormat>("single");
  const [slideCount, setSlideCount] = React.useState(3);
  const [networks, setNetworks] = React.useState<TargetNetwork[]>(["instagram"]);
  const [objective, setObjective] = React.useState("");
  const [tone, setTone] = React.useState("");
  const [aiOptin, setAiOptin] = React.useState(false);

  const incompat = React.useMemo(
    () => checkFormatCompatibility(format, networks),
    [format, networks],
  );

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          templateCategory: category,
          postFormat: format,
          carouselSlideCount: format === "carousel" ? slideCount : undefined,
          targetNetworks: networks,
          freeTextObjective: objective || undefined,
          toneOverride: tone || undefined,
          aiImageOptin: aiOptin,
        },
      }),
    onSuccess: () => {
      toast.success("Post sendo gerado. Você será notificado em instantes.");
      nav({ to: "/content/assets" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar brief"),
  });

  const toggleNetwork = (n: TargetNetwork) => {
    setNetworks((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  };

  const canSubmit = networks.length > 0 && incompat.length === 0 && !submit.isPending;

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 720 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          O que você quer comunicar?
        </div>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Ex: promoção de corte + escova por R$ 89 essa semana"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Card>

      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Categoria do post</div>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
        >
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-control)",
                border: `1px solid ${category === c ? "var(--accent)" : "var(--border)"}`,
                background: category === c ? "var(--accent-soft)" : "var(--surface)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: category === c ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Formato</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {POST_FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-control)",
                border: `1px solid ${format === f ? "var(--accent)" : "var(--border)"}`,
                background: format === f ? "var(--accent-soft)" : "var(--surface)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: format === f ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
        {format === "carousel" ? (
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Slides ({slideCount})</label>
            <input
              type="range"
              min={2}
              max={10}
              value={slideCount}
              onChange={(e) => setSlideCount(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        ) : null}
      </Card>

      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Redes de destino</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {TARGET_NETWORKS.map((n) => (
            <button
              key={n}
              onClick={() => toggleNetwork(n)}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-control)",
                border: `1px solid ${networks.includes(n) ? "var(--accent)" : "var(--border)"}`,
                background: networks.includes(n) ? "var(--accent-soft)" : "var(--surface)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: networks.includes(n) ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {NETWORK_LABEL[n]}
            </button>
          ))}
        </div>
        {incompat.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              borderRadius: "var(--radius-control)",
              background: "var(--danger-soft, #FEE2E2)",
              color: "var(--danger, #B91C1C)",
              fontSize: 12,
            }}
          >
            {incompat.map((i) => i.reason).join(". ")}. Remova essas redes ou troque o formato.
          </div>
        ) : null}
      </Card>

      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Tom de voz</div>
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Ex: divertido e leve (opcional; usa o Brand Kit se vazio)"
          style={inputStyle}
        />
      </Card>

      {canAiOptin ? (
        <Card style={{ padding: 20 }}>
          <label className="flex items-start" style={{ gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={aiOptin}
              onChange={(e) => setAiOptin(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Gerar imagem única por IA</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Aumenta o custo do post. Só use quando o banco de imagens padrão não trouxer
                resultado adequado.
              </div>
            </div>
          </label>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <button
          onClick={() => submit.mutate()}
          disabled={!canSubmit}
          style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.5 }}
        >
          {submit.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Gerar post
        </button>
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
  marginBottom: 6,
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
