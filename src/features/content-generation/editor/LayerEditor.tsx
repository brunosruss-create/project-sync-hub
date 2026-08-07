// Editor visual drag-and-drop de camadas sobre a foto base.
// - Foto de fundo: fixa, imutável (imagem gerada pela IA / Pexels)
// - Cada camada por cima é arrastável com o mouse
// - Clique numa camada seleciona; painel lateral mostra propriedades (texto, cor, tamanho)
// - Ao salvar, layers_json é persistido no generated_assets

import * as React from "react";
import { Type, Tag, Square, Minus, Trash2 } from "lucide-react";
import type { Layer, LayerComposition, LayerId } from "./layer-types";
import {
  createTextLayer,
  createSignatureLayer,
  createOverlayLayer,
  createAccentLineLayer,
} from "./layer-types";

interface Props {
  imageUrl: string;
  composition: LayerComposition;
  onChange: (composition: LayerComposition) => void;
  /** Presets pra novas camadas (fonte, cores, marca). */
  brandDefaults?: {
    displayFont?: string;
    primaryColor?: string;
    secondaryColor?: string;
    supportColor?: string;
    signature?: string;
  };
}

export function LayerEditor({ imageUrl, composition, onChange, brandDefaults }: Props) {
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = React.useState<LayerId | null>(null);
  const [editingId, setEditingId] = React.useState<LayerId | null>(null);
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number;
    y: number;
    layerId: LayerId;
  } | null>(null);
  const [displayScale, setDisplayScale] = React.useState(1);
  const isStory = composition.canvasHeight > composition.canvasWidth;

  // Recalcula escala quando o container é montado ou redimensionado.
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setDisplayScale(rect.width / composition.canvasWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [composition.canvasWidth]);

  const updateLayer = (id: LayerId, patch: Partial<Layer>) => {
    onChange({
      ...composition,
      layers: composition.layers.map((l) =>
        l.id === id ? ({ ...l, ...patch } as Layer) : l,
      ),
    });
  };

  const addLayer = (layer: Layer) => {
    onChange({ ...composition, layers: [...composition.layers, layer] });
    setSelectedId(layer.id);
  };

  const removeLayer = (id: LayerId) => {
    onChange({ ...composition, layers: composition.layers.filter((l) => l.id !== id) });
    setSelectedId(null);
    setEditingId(null);
    setCtxMenu(null);
  };

  const duplicateLayer = (id: LayerId) => {
    const original = composition.layers.find((l) => l.id === id);
    if (!original) return;
    const copy = {
      ...original,
      id: `${original.type}-${Date.now()}`,
      x: Math.min(original.x + 32, composition.canvasWidth - 20),
      y: Math.min(original.y + 32, composition.canvasHeight - 20),
    } as Layer;
    onChange({ ...composition, layers: [...composition.layers, copy] });
    setSelectedId(copy.id);
    setCtxMenu(null);
  };

  const reorderLayer = (id: LayerId, dir: "front" | "back") => {
    const idx = composition.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const arr = [...composition.layers];
    const [item] = arr.splice(idx, 1);
    if (dir === "front") arr.push(item);
    else arr.unshift(item);
    onChange({ ...composition, layers: arr });
    setCtxMenu(null);
  };

  // Tecla Delete/Backspace remove o bloco selecionado (exceto durante edição de texto).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId || !selectedId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeLayer(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, editingId, composition]);

  const addText = () =>
    addLayer(
      createTextLayer({
        text: "Toque pra editar",
        isStory,
        displayFont: brandDefaults?.displayFont,
        size: "large",
      }),
    );

  const addSignature = () =>
    addLayer(
      createSignatureLayer({
        text: brandDefaults?.signature ?? "Sua Marca",
        displayFont: brandDefaults?.displayFont,
      }),
    );

  const addOverlay = () =>
    addLayer(
      createOverlayLayer({
        color: brandDefaults?.secondaryColor ?? "#0F172A",
        isStory,
      }),
    );

  const addAccentLine = () =>
    addLayer(
      createAccentLineLayer({
        color: brandDefaults?.supportColor ?? "#F59E0B",
        isStory,
      }),
    );

  const selected = composition.layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {/* Toolbar */}
      <div
        className="flex flex-wrap"
        style={{
          gap: 6,
          padding: 8,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
        }}
      >
        <ToolbarButton onClick={addText} icon={<Type size={13} />} label="Texto" />
        <ToolbarButton onClick={addSignature} icon={<Tag size={13} />} label="Marca" />
        <ToolbarButton onClick={addOverlay} icon={<Square size={13} />} label="Fundo escuro" />
        <ToolbarButton onClick={addAccentLine} icon={<Minus size={13} />} label="Linha" />
        {selected ? (
          <ToolbarButton
            onClick={() => removeLayer(selected.id)}
            icon={<Trash2 size={13} />}
            label="Remover"
            danger
          />
        ) : null}
      </div>

      {/* Canvas de edição */}
      <div
        ref={canvasRef}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${composition.canvasWidth} / ${composition.canvasHeight}`,
          background: "#000",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          userSelect: "none",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedId(null);
            setEditingId(null);
            setCtxMenu(null);
          }
        }}
      >
        {/* Foto base fixa */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />

        {/* Camadas — cada uma arrastável */}
        {composition.layers.map((layer) => (
          <LayerNode
            key={layer.id}
            layer={layer}
            selected={selectedId === layer.id}
            editing={editingId === layer.id}
            scale={displayScale}
            canvasWidth={composition.canvasWidth}
            canvasHeight={composition.canvasHeight}
            onSelect={() => setSelectedId(layer.id)}
            onStartEdit={() => {
              setSelectedId(layer.id);
              setEditingId(layer.id);
            }}
            onStopEdit={() => setEditingId(null)}
            onOpenMenu={(x, y) => {
              setSelectedId(layer.id);
              setCtxMenu({ x, y, layerId: layer.id });
            }}
            onUpdate={(patch) => updateLayer(layer.id, patch)}
          />
        ))}
      </div>

      {/* Painel de propriedades da camada selecionada */}
      {selected ? (
        <PropertiesPanel
          layer={selected}
          onChange={(patch) => updateLayer(selected.id, patch)}
        />
      ) : (
        <div
          style={{
            padding: 10,
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          Clique pra selecionar · duplo-clique edita o texto · Delete remove · botão direito = mais opções
        </div>
      )}

      {/* Menu de contexto (botão direito) */}
      {ctxMenu ? (
        <>
          {/* Backdrop pra fechar ao clicar fora */}
          <div
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
            style={{ position: "fixed", inset: 0, zIndex: 998 }}
          />
          <div
            style={{
              position: "fixed",
              left: ctxMenu.x,
              top: ctxMenu.y,
              zIndex: 999,
              minWidth: 180,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-card)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <CtxItem
              label="Duplicar"
              onClick={() => duplicateLayer(ctxMenu.layerId)}
            />
            <CtxItem
              label="Trazer pra frente"
              onClick={() => reorderLayer(ctxMenu.layerId, "front")}
            />
            <CtxItem
              label="Enviar pra trás"
              onClick={() => reorderLayer(ctxMenu.layerId, "back")}
            />
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <CtxItem
              label="Remover elemento"
              danger
              onClick={() => removeLayer(ctxMenu.layerId)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function CtxItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        fontSize: 13,
        borderRadius: "var(--radius-control)",
        background: "transparent",
        color: danger ? "var(--danger, #B91C1C)" : "var(--text-primary)",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-base)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

// ─── LayerNode: elemento arrastável ─────────────────────────────────

interface LayerNodeProps {
  layer: Layer;
  selected: boolean;
  editing: boolean;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onOpenMenu: (x: number, y: number) => void;
  onUpdate: (patch: Partial<Layer>) => void;
}

function LayerNode(props: LayerNodeProps) {
  const {
    layer,
    selected,
    editing,
    scale,
    canvasWidth,
    canvasHeight,
    onSelect,
    onStartEdit,
    onStopEdit,
    onOpenMenu,
    onUpdate,
  } = props;
  const dragState = React.useRef<{ startX: number; startY: number; layerX: number; layerY: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    onOpenMenu(e.clientX, e.clientY);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (layer.locked || editing) return;
    e.stopPropagation();
    onSelect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      layerX: layer.x,
      layerY: layer.y,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = (ev.clientX - dragState.current.startX) / scale;
      const dy = (ev.clientY - dragState.current.startY) / scale;
      let newX = dragState.current.layerX + dx;
      let newY = dragState.current.layerY + dy;
      newX = Math.max(0, Math.min(canvasWidth, newX));
      newY = Math.max(0, Math.min(canvasHeight, newY));
      onUpdate({ x: Math.round(newX), y: Math.round(newY) });
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Props de interação comuns a todos os tipos de bloco (arrastar + menu de contexto).
  const interactionProps = {
    onMouseDown: handleMouseDown,
    onContextMenu: handleContextMenu,
  };

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left: `${(layer.x / canvasWidth) * 100}%`,
    top: `${(layer.y / canvasHeight) * 100}%`,
    cursor: layer.locked ? "default" : "move",
    outline: selected ? "2px dashed #3654FF" : "none",
    outlineOffset: 2,
  };

  if (layer.type === "text") {
    // Edição inline: duplo-clique abre textarea sobreposta na mesma posição.
    if (editing) {
      return (
        <textarea
          autoFocus
          value={layer.text}
          onChange={(e) => onUpdate({ text: e.target.value } as Partial<Layer>)}
          onBlur={onStopEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") onStopEdit();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onStopEdit();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...commonStyle,
            cursor: "text",
            outline: "2px solid #3654FF",
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize * scale,
            fontWeight: layer.fontWeight,
            color: layer.color,
            lineHeight: layer.lineHeight,
            letterSpacing: layer.letterSpacing ? layer.letterSpacing * scale : undefined,
            textTransform: layer.textTransform ?? "none",
            width: (layer.maxWidth ?? canvasWidth * 0.8) * scale,
            background: "rgba(0,0,0,0.55)",
            border: "none",
            resize: "none",
            padding: 4,
            overflow: "hidden",
            whiteSpace: "pre-wrap",
          }}
        />
      );
    }
    // Destaque inline: colore palavras do trecho destacado no fluxo natural.
    if (layer.highlight) {
      const highlightWords = new Set(
        layer.highlight
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^\wáàâãéèêíïóôõöúçñ$]/gi, "")),
      );
      const words = layer.text.split(/\s+/);
      return (
        <div
          {...interactionProps}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
          style={{
            ...commonStyle,
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize * scale,
            fontWeight: layer.fontWeight,
            lineHeight: layer.lineHeight,
            letterSpacing: layer.letterSpacing ? layer.letterSpacing * scale : undefined,
            textTransform: layer.textTransform ?? "none",
            maxWidth: layer.maxWidth ? layer.maxWidth * scale : undefined,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          {words.map((word, i) => {
            const clean = word.replace(/[^\wáàâãéèêíïóôõöúçñ$]/gi, "").toLowerCase();
            const isHi = highlightWords.has(clean);
            return (
              <span
                key={i}
                style={{
                  color: isHi ? layer.highlightColor ?? "#F59E0B" : layer.color,
                  marginRight: layer.fontSize * 0.26 * scale,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      );
    }
    return (
      <div
        {...interactionProps}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
        style={{
          ...commonStyle,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize * scale,
          fontWeight: layer.fontWeight,
          color: layer.color,
          textAlign: layer.align,
          lineHeight: layer.lineHeight,
          letterSpacing: layer.letterSpacing ? layer.letterSpacing * scale : undefined,
          textTransform: layer.textTransform ?? "none",
          maxWidth: layer.maxWidth ? layer.maxWidth * scale : undefined,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "pill") {
    return (
      <div
        {...interactionProps}
        style={{
          ...commonStyle,
          display: "inline-flex",
          alignItems: "center",
          paddingLeft: layer.paddingX * scale,
          paddingRight: layer.paddingX * scale,
          paddingTop: layer.paddingY * scale,
          paddingBottom: layer.paddingY * scale,
          background: layer.bg,
          color: layer.color,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize * scale,
          fontWeight: 700,
          letterSpacing: 4 * scale,
          textTransform: "uppercase",
          borderRadius: 999,
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "rect") {
    return (
      <div
        {...interactionProps}
        style={{
          ...commonStyle,
          width: layer.width * scale,
          height: layer.height * scale,
          background: layer.gradient
            ? `linear-gradient(${layer.gradientDirection ?? "to bottom"}, ${layer.gradientFrom ?? "transparent"} 0%, ${layer.bg} 100%)`
            : layer.bg,
          opacity: layer.opacity ?? 1,
          borderRadius: layer.radius ? layer.radius * scale : 0,
        }}
      />
    );
  }

  if (layer.type === "line") {
    return (
      <div
        {...interactionProps}
        style={{
          ...commonStyle,
          width: layer.width * scale,
          height: layer.height * scale,
          background: layer.color,
          borderRadius: 4,
        }}
      />
    );
  }

  if (layer.type === "button") {
    return (
      <div
        {...interactionProps}
        style={{
          ...commonStyle,
          display: "inline-flex",
          alignItems: "center",
          paddingLeft: layer.paddingX * scale,
          paddingRight: layer.paddingX * scale,
          paddingTop: layer.paddingY * scale,
          paddingBottom: layer.paddingY * scale,
          background: layer.bg,
          color: layer.color,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize * scale,
          fontWeight: 700,
          borderRadius: layer.radius * scale,
          whiteSpace: "nowrap",
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "image") {
    return (
      <img
        src={layer.url}
        alt=""
        draggable={false}
        {...interactionProps}
        style={{
          ...commonStyle,
          width: layer.width * scale,
          height: layer.height * scale,
          objectFit: layer.fit ?? "contain",
          borderRadius: (layer.radius ?? 0) * scale,
        }}
      />
    );
  }

  return null;
}

// ─── PropertiesPanel ────────────────────────────────────────────────

function PropertiesPanel({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <div
      style={{
        padding: 14,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-card)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Elemento selecionado · {layer.type}
      </div>

      {(layer.type === "text" || layer.type === "pill") && (
        <div>
          <label style={labelStyle}>Texto</label>
          {layer.type === "text" && layer.fontSize > 40 ? (
            <textarea
              value={layer.text}
              onChange={(e) => onChange({ text: e.target.value } as Partial<Layer>)}
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          ) : (
            <input
              value={layer.text}
              onChange={(e) => onChange({ text: e.target.value } as Partial<Layer>)}
              style={inputStyle}
            />
          )}
        </div>
      )}

      {layer.type === "text" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Cor do texto</label>
            <ColorInput
              value={layer.color}
              onChange={(v) => onChange({ color: v } as Partial<Layer>)}
            />
          </div>
          <div>
            <label style={labelStyle}>Tamanho ({layer.fontSize}px)</label>
            <input
              type="range"
              min={12}
              max={140}
              value={layer.fontSize}
              onChange={(e) =>
                onChange({ fontSize: Number(e.target.value) } as Partial<Layer>)
              }
              style={{ width: "100%" }}
            />
          </div>
        </div>
      )}

      {layer.type === "pill" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Cor de fundo</label>
            <ColorInput
              value={layer.bg}
              onChange={(v) => onChange({ bg: v } as Partial<Layer>)}
            />
          </div>
          <div>
            <label style={labelStyle}>Cor do texto</label>
            <ColorInput
              value={layer.color}
              onChange={(v) => onChange({ color: v } as Partial<Layer>)}
            />
          </div>
        </div>
      )}

      {layer.type === "rect" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Cor</label>
            <ColorInput
              value={layer.bg}
              onChange={(v) => onChange({ bg: v } as Partial<Layer>)}
            />
          </div>
          <div>
            <label style={labelStyle}>
              Transparência ({Math.round((layer.opacity ?? 1) * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={(layer.opacity ?? 1) * 100}
              onChange={(e) =>
                onChange({ opacity: Number(e.target.value) / 100 } as Partial<Layer>)
              }
              style={{ width: "100%" }}
            />
          </div>
        </div>
      )}

      {layer.type === "line" && (
        <div>
          <label style={labelStyle}>Cor</label>
          <ColorInput
            value={layer.color}
            onChange={(v) => onChange({ color: v } as Partial<Layer>)}
          />
        </div>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <label
        style={{
          width: 32,
          height: 32,
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
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          flex: 1,
          textTransform: "uppercase",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
        }}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 4,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 12,
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
};

function ToolbarButton({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 28,
        padding: "0 10px",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: "var(--radius-pill)",
        background: danger ? "color-mix(in oklab, var(--danger, #EF4444) 12%, transparent)" : "var(--bg-base)",
        color: danger ? "var(--danger, #B91C1C)" : "var(--text-primary)",
        border: `1px solid ${danger ? "color-mix(in oklab, var(--danger, #EF4444) 30%, transparent)" : "var(--border-strong)"}`,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
