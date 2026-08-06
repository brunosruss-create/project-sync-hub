import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, RefreshCw, ArrowLeft, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAsset,
  rejectAsset,
  regenerateAsset,
} from "@/lib/content-generation.functions";

export const Route = createFileRoute("/_authenticated/content/review/$assetId")({
  component: AssetDetailPage,
});

function AssetDetailPage() {
  const { assetId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getAsset);
  const rejectFn = useServerFn(rejectAsset);
  const regenFn = useServerFn(regenerateAsset);

  const assetQ = useQuery({
    queryKey: ["content-asset", assetId],
    queryFn: () => getFn({ data: { assetId } }),
  });

  const asset = assetQ.data?.asset;

  // Estado editável — inicia com os valores do asset.
  const [editHook, setEditHook] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [editCta, setEditCta] = React.useState("");

  React.useEffect(() => {
    if (asset) {
      setEditHook(asset.copyBundle.hook);
      setEditBody(asset.copyBundle.body);
      setEditCta(asset.copyBundle.cta);
    }
  }, [asset]);

  const sendToComposer = () => {
    if (!asset) return;
    const network = asset.targetNetwork;
    const perNet = asset.copyBundle.perNetwork;
    // Monta texto final usando as edições do usuário (não o original).
    let fullText =
      network === "youtube" && perNet.youtube
        ? `${perNet.youtube.title}\n\n${perNet.youtube.description}`
        : (perNet as any)[network]?.fullText ?? editBody;
    // Substitui hook/body/cta editados no fullText final.
    fullText = `${editHook}\n\n${editBody}\n\n${editCta}`;
    const params = new URLSearchParams({
      aiAssetId: asset.id,
      network,
      text: fullText,
      mediaUrl: asset.renderedImageUrl,
      hashtags: asset.copyBundle.hashtags.join(","),
    });
    nav({ to: `/social/compose?${params.toString()}` as any });
  };

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { assetId } }),
    onSuccess: () => {
      toast.success("Post descartado");
      nav({ to: "/content/assets" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao descartar"),
  });

  const regen = useMutation({
    mutationFn: (mode: "copy_only" | "image_only" | "both") =>
      regenFn({ data: { assetId, mode } }),
    onSuccess: () => {
      toast.success("Nova versão sendo gerada — aparece em instantes");
      qc.invalidateQueries({ queryKey: ["content-asset", assetId] });
      qc.invalidateQueries({ queryKey: ["content-assets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao regenerar"),
  });

  if (assetQ.isLoading || !asset) {
    return (
      <div
        className="flex items-center"
        style={{ gap: 8, padding: 24, color: "var(--text-muted)" }}
      >
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Carregando...</span>
      </div>
    );
  }

  const isPending = asset.approvalStatus === "pending";
  const copy = asset.copyBundle;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <button
        onClick={() => nav({ to: "/content/assets" })}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: 0,
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 12,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        <ArrowLeft size={13} />
        Voltar
      </button>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}
      >
        {/* Imagem */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <img
            src={asset.renderedImageUrl}
            alt="Preview"
            style={{ width: "100%", display: "block" }}
          />
          {asset.slides && asset.slides.length > 1 ? (
            <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {asset.slides.map((s) => (
                <img
                  key={s.index}
                  src={s.url}
                  alt={`Slide ${s.index}`}
                  style={{
                    width: 60,
                    height: 60,
                    objectFit: "cover",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
          ) : null}
          {/* Botão de refazer imagem sob a foto */}
          {isPending ? (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => regen.mutate("image_only")}
                disabled={regen.isPending}
                style={secondaryBtnSm}
              >
                <RefreshCw size={12} />
                Gerar outra imagem
              </button>
            </div>
          ) : null}
        </Card>

        {/* Texto editável + status */}
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <Badge
              variant={
                asset.approvalStatus === "approved"
                  ? "success"
                  : asset.approvalStatus === "rejected"
                    ? "danger"
                    : "warning"
              }
            >
              {asset.approvalStatus === "approved"
                ? "Publicado"
                : asset.approvalStatus === "rejected"
                  ? "Rejeitado"
                  : "Aguardando revisão"}
            </Badge>
            <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>
              {asset.targetNetwork}
            </span>
          </div>

          {/* Chamada — editável */}
          <Card style={{ padding: 14 }}>
            <label style={fieldLabel}>Chamada</label>
            {isPending ? (
              <input
                value={editHook}
                onChange={(e) => setEditHook(e.target.value)}
                style={editInput}
              />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 600 }}>{copy.hook}</div>
            )}
          </Card>

          {/* Corpo — editável */}
          <Card style={{ padding: 14 }}>
            <label style={fieldLabel}>Corpo</label>
            {isPending ? (
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={4}
                style={{ ...editInput, resize: "vertical", fontFamily: "inherit", minHeight: 80 }}
              />
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {copy.body}
              </div>
            )}
          </Card>

          {/* CTA — editável */}
          <Card style={{ padding: 14 }}>
            <label style={fieldLabel}>Ação final</label>
            {isPending ? (
              <input
                value={editCta}
                onChange={(e) => setEditCta(e.target.value)}
                style={{ ...editInput, color: "var(--brand-400)", fontWeight: 600 }}
              />
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--brand-400)" }}>
                {copy.cta}
              </div>
            )}
          </Card>

          {/* Hashtags (não editável aqui — pode editar no compose depois) */}
          {copy.hashtags.length > 0 ? (
            <Card style={{ padding: 14 }}>
              <div style={fieldLabel}>Hashtags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {copy.hashtags.map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 11,
                      color: "var(--brand-400)",
                      padding: "3px 10px",
                      background: "color-mix(in oklab, var(--brand-400) 12%, transparent)",
                      borderRadius: "var(--radius-pill)",
                      fontWeight: 500,
                    }}
                  >
                    #{h.replace(/^#/, "")}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Ação de regenerar texto */}
          {isPending ? (
            <button
              onClick={() => regen.mutate("copy_only")}
              disabled={regen.isPending}
              style={secondaryBtnSm}
            >
              <RefreshCw size={12} />
              Gerar outro texto
            </button>
          ) : null}
        </div>
      </div>

      {/* Ações principais */}
      {isPending ? (
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, paddingTop: 4 }}>
          <button
            onClick={() => reject.mutate()}
            disabled={reject.isPending}
            style={{
              ...secondaryBtn,
              color: "var(--danger, #B91C1C)",
              borderColor: "var(--danger, #FCA5A5)",
            }}
          >
            <X size={13} />
            Descartar
          </button>
          <button onClick={sendToComposer} className="btn-primary" style={{ height: 38, fontSize: 14 }}>
            <Check size={14} />
            Revisar e publicar
          </button>
        </div>
      ) : null}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

const editInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 36,
  padding: "0 16px",
  borderRadius: "var(--radius-pill)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--border-strong)",
  cursor: "pointer",
};

const secondaryBtnSm: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 12px",
  borderRadius: "var(--radius-pill)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid var(--border)",
  cursor: "pointer",
  width: "fit-content",
};
