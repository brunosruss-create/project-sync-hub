import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2, Facebook, Instagram, Youtube, Music2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { submitBrief } from "@/lib/content-generation.functions";
import { listSocialAccounts } from "@/lib/social-publishing.functions";
import {
  TEMPLATE_CATEGORIES,
  POST_FORMATS,
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

const NETWORK_ICON: Record<TargetNetwork, React.ReactNode> = {
  facebook: <Facebook size={14} />,
  instagram: <Instagram size={14} />,
  tiktok: <Music2 size={14} />,
  youtube: <Youtube size={14} />,
};

const NETWORK_LABEL: Record<TargetNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// Tom de voz — chips prontos + livre. Cliente não precisa escrever prompt.
const TONE_CHIPS = [
  { key: "profissional", label: "Profissional" },
  { key: "divertido", label: "Divertido e leve" },
  { key: "motivacional", label: "Motivacional" },
  { key: "acolhedor", label: "Acolhedor" },
  { key: "vendedor", label: "Vendedor/persuasivo" },
  { key: "educativo", label: "Educativo" },
] as const;

function ComposePage() {
  const nav = useNavigate();
  const submitFn = useServerFn(submitBrief);
  const accountsFn = useServerFn(listSocialAccounts);

  const accountsQ = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => accountsFn(),
  });
  const availableNetworks = React.useMemo<TargetNetwork[]>(() => {
    const accounts = accountsQ.data?.accounts ?? [];
    const connected = new Set(
      accounts
        .filter((a: any) => a.status === "connected")
        .map((a: any) => a.platform as TargetNetwork),
    );
    return Array.from(connected);
  }, [accountsQ.data]);

  const [category, setCategory] = React.useState<TemplateCategory>("promo");
  const [format, setFormat] = React.useState<PostFormat>("single");
  const [slideCount, setSlideCount] = React.useState(3);
  const [networks, setNetworks] = React.useState<TargetNetwork[]>([]);
  const [objective, setObjective] = React.useState("");
  const [tone, setTone] = React.useState<string>("profissional");

  React.useEffect(() => {
    if (availableNetworks.length > 0 && networks.length === 0) {
      setNetworks(availableNetworks);
    }
  }, [availableNetworks, networks.length]);

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
          aiImageOptin: false,
        },
      }),
    onSuccess: () => {
      toast.success("Seu post está sendo criado. Isso leva alguns segundos.");
      nav({ to: "/content/assets" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar post"),
  });

  const toggleNetwork = (n: TargetNetwork) => {
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const canSubmit =
    networks.length > 0 &&
    incompat.length === 0 &&
    objective.trim().length > 0 &&
    !submit.isPending;

  return (
    <div className="flex flex-col" style={{ gap: 14, maxWidth: 760 }}>
      {/* Objetivo — mais espaço, é o campo mais importante */}
      <Card style={{ padding: 20 }}>
        <label style={sectionLabel}>Sobre o que é o post?</label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Ex: promoção de corte + escova por R$ 89 nessa semana. Válido de segunda a sexta."
          rows={3}
          style={{ ...input, resize: "vertical", fontFamily: "inherit", minHeight: 90 }}
        />
        <div style={hint}>Escreva em linguagem natural. Quanto mais contexto, melhor o resultado.</div>
      </Card>

      {/* Categoria */}
      <Card style={{ padding: 20 }}>
        <label style={sectionLabel}>Tipo do post</label>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
        >
          {TEMPLATE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={CATEGORY_LABEL[c]}
            />
          ))}
        </div>
      </Card>

      {/* Formato */}
      <Card style={{ padding: 20 }}>
        <label style={sectionLabel}>Formato</label>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {POST_FORMATS.map((f) => (
            <Chip
              key={f}
              active={format === f}
              onClick={() => setFormat(f)}
              label={FORMAT_LABEL[f]}
            />
          ))}
        </div>
        {format === "carousel" ? (
          <div style={{ marginTop: 14 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Slides</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{slideCount}</span>
            </div>
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

      {/* Redes */}
      <Card style={{ padding: 20 }}>
        <label style={sectionLabel}>Publicar em</label>
        {availableNetworks.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Nenhuma rede conectada.{" "}
            <a href="/social/accounts" style={{ color: "var(--brand-400)" }}>
              Conectar agora →
            </a>
          </div>
        ) : (
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {availableNetworks.map((n) => {
              const selected = networks.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleNetwork(n)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: "var(--radius-pill)",
                    border: `1px solid ${selected ? "var(--brand-400)" : "var(--border-strong)"}`,
                    background: selected
                      ? "color-mix(in oklab, var(--brand-400) 14%, transparent)"
                      : "var(--bg-surface)",
                    color: selected ? "var(--brand-400)" : "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: selected ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  {NETWORK_ICON[n]}
                  {NETWORK_LABEL[n]}
                </button>
              );
            })}
          </div>
        )}
        {incompat.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: "var(--radius-control)",
              background: "color-mix(in oklab, var(--danger, #EF4444) 8%, transparent)",
              color: "var(--danger, #B91C1C)",
              fontSize: 12,
            }}
          >
            {incompat.map((i) => i.reason).join(". ")}. Escolha outro formato ou desmarque essa rede.
          </div>
        ) : null}
      </Card>

      {/* Tom de voz — chips dinâmicos */}
      <Card style={{ padding: 20 }}>
        <label style={sectionLabel}>Tom da mensagem</label>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {TONE_CHIPS.map((t) => (
            <Chip
              key={t.key}
              active={tone === t.key}
              onClick={() => setTone(t.key)}
              label={t.label}
              size="sm"
            />
          ))}
        </div>
      </Card>

      {/* Botão fixo */}
      <div className="flex justify-end" style={{ marginTop: 4 }}>
        <button
          onClick={() => submit.mutate()}
          disabled={!canSubmit}
          className="btn-primary"
          style={{
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
            height: 40,
            padding: "0 22px",
            fontSize: 14,
          }}
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

function Chip({
  active,
  onClick,
  label,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: size === "sm" ? "6px 14px" : "10px 12px",
        borderRadius: size === "sm" ? "var(--radius-pill)" : "var(--radius-control)",
        border: `1px solid ${active ? "var(--brand-400)" : "var(--border-strong)"}`,
        background: active
          ? "color-mix(in oklab, var(--brand-400) 12%, transparent)"
          : "var(--bg-surface)",
        color: active ? "var(--brand-400)" : "var(--text-primary)",
        fontSize: size === "sm" ? 12 : 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {label}
    </button>
  );
}

const sectionLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 10,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 13,
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
};

const hint: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 6,
};
