import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, RefreshCw, ArrowLeft, Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAsset,
  rejectAsset,
  regenerateAsset,
  saveAssetLayers,
  enqueueRenderComposition,
} from "@/lib/content-generation.functions";
import { getBrandKit } from "@/lib/brand-kit.functions";
import { LayerEditor } from "@/features/content-generation/editor/LayerEditor";
import {
  buildInitialComposition,
  type LayerComposition,
} from "@/features/content-generation/editor/layer-types";

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
  const saveLayersFn = useServerFn(saveAssetLayers);
  const enqueueRenderFn = useServerFn(enqueueRenderComposition);
  const getBrandKitFn = useServerFn(getBrandKit);
  const [publishing, setPublishing] = React.useState(false);

  const assetQ = useQuery({
    queryKey: ["content-asset", assetId],
    queryFn: () => getFn({ data: { assetId } }),
  });
  const brandKitQ = useQuery({
    queryKey: ["brand-kit"],
    queryFn: () => getBrandKitFn(),
  });

  const asset = assetQ.data?.asset;
  const brandKit = brandKitQ.data?.brandKit;

  // Composição de camadas: carregada do banco ou inicializada a partir da copy.
  const [composition, setComposition] = React.useState<LayerComposition | null>(null);
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (initialized || !asset || !brandKit) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (asset as any).layersJson ?? (asset as any).layers_json;
    if (existing?.layers?.length) {
      setComposition(existing);
    } else {
      const isStory = false; // TODO: pegar do brief se for story
      setComposition(
        buildInitialComposition({
          format: isStory ? "story" : "single",
          hook: asset.copyBundle.hook,
          cta: asset.copyBundle.cta,
          signature: brandKit.defaultSignature || "Sua Marca",
          primaryColor: brandKit.primaryColor,
          secondaryColor: brandKit.secondaryColor,
          supportColor: brandKit.supportColor,
          displayFont: brandKit.displayFont,
          bodyFont: brandKit.bodyFont,
          category: undefined,
        }),
      );
    }
    setInitialized(true);
  }, [asset, brandKit, initialized]);

  const saveLayers = useMutation({
    mutationFn: () => {
      if (!composition) throw new Error("Nada pra salvar");
      return saveLayersFn({ data: { assetId, composition } });
    },
    onSuccess: () => {
      toast.success("Edições salvas");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar edições"),
  });

  const sendToComposer = async () => {
    if (!asset) return;
    setPublishing(true);
    try {
      // 1. Salva as edições (layers_json)
      let hasLayers = false;
      if (composition && composition.layers.length > 0) {
        await saveLayersFn({ data: { assetId, composition } });
        hasLayers = true;
      }

      // 2. Se editou, enfileira job de renderização no worker e aguarda o
      //    PNG final ficar pronto (polling até rendered_image_url mudar).
      let finalUrl = asset.renderedImageUrl;
      if (hasLayers) {
        toast.info("Aplicando edições na imagem final...");
        const originalUrl = asset.renderedImageUrl;
        await enqueueRenderFn({ data: { assetId } });

        // Polling: aguarda até 30s pela URL nova
        const started = Date.now();
        while (Date.now() - started < 30_000) {
          await new Promise((r) => setTimeout(r, 2000));
          const fresh = await qc
            .fetchQuery({
              queryKey: ["content-asset", assetId, "poll"],
              queryFn: () => getFn({ data: { assetId } }),
              staleTime: 0,
            })
            .catch(() => null);
          if (fresh?.asset && fresh.asset.renderedImageUrl !== originalUrl) {
            finalUrl = fresh.asset.renderedImageUrl;
            break;
          }
        }
      }

      // 3. Redireciona pro compose com a imagem final
      const network = asset.targetNetwork;
      const perNet = asset.copyBundle.perNetwork;
      const fullText =
        network === "youtube" && perNet.youtube
          ? `${perNet.youtube.title}\n\n${perNet.youtube.description}`
          : (perNet as any)[network]?.fullText ?? asset.copyBundle.body;
      const params = new URLSearchParams({
        aiAssetId: asset.id,
        network,
        text: fullText,
        mediaUrl: finalUrl,
        hashtags: asset.copyBundle.hashtags.join(","),
      });
      nav({ to: `/social/compose?${params.toString()}` as any });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao preparar publicação");
    } finally {
      setPublishing(false);
    }
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

  if (assetQ.isLoading || !asset || !brandKit || !composition) {
    return (
      <div
        className="flex items-center"
        style={{ gap: 8, padding: 24, color: "var(--text-muted)" }}
      >
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Carregando editor...</span>
      </div>
    );
  }

  const isPending = asset.approvalStatus === "pending";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseImageUrl = (asset as any).baseImageUrl ?? asset.renderedImageUrl;

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
        style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 20 }}
      >
        {/* Editor de camadas */}
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex items-center justify-between">
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
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textTransform: "capitalize",
                }}
              >
                {asset.targetNetwork}
              </span>
            </div>
            {isPending ? (
              <button
                onClick={() => regen.mutate("image_only")}
                disabled={regen.isPending}
                style={secondaryBtnSm}
              >
                <RefreshCw size={12} />
                Nova imagem
              </button>
            ) : null}
          </div>

          {isPending ? (
            <LayerEditor
              imageUrl={baseImageUrl}
              composition={composition}
              onChange={setComposition}
            />
          ) : (
            <img
              src={asset.renderedImageUrl}
              alt="Preview final"
              style={{
                width: "100%",
                display: "block",
                borderRadius: "var(--radius-card)",
              }}
            />
          )}
        </div>

        {/* Painel lateral: legenda + hashtags + regenerar */}
        <div className="flex flex-col" style={{ gap: 12 }}>
          <Card style={{ padding: 14 }}>
            <div style={fieldLabel}>Legenda</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {asset.copyBundle.body}
            </div>
          </Card>

          {asset.copyBundle.hashtags.length > 0 ? (
            <Card style={{ padding: 14 }}>
              <div style={fieldLabel}>Hashtags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {asset.copyBundle.hashtags.map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 11,
                      color: "var(--brand-400)",
                      padding: "3px 10px",
                      background:
                        "color-mix(in oklab, var(--brand-400) 12%, transparent)",
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

          {isPending ? (
            <>
              <button
                onClick={() => regen.mutate("copy_only")}
                disabled={regen.isPending}
                style={secondaryBtnSm}
              >
                <RefreshCw size={12} />
                Gerar outro texto
              </button>
              <button
                onClick={() => saveLayers.mutate()}
                disabled={saveLayers.isPending}
                style={secondaryBtnSm}
              >
                {saveLayers.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                Salvar edições
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <div
          className="flex flex-wrap items-center justify-between"
          style={{ gap: 8, paddingTop: 4 }}
        >
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
          <button
            onClick={sendToComposer}
            disabled={publishing}
            className="btn-primary"
            style={{ height: 38, fontSize: 14, opacity: publishing ? 0.6 : 1 }}
          >
            {publishing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {publishing ? "Preparando..." : "Publicar"}
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
  alignSelf: "flex-start",
};
