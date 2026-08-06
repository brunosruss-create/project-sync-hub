// Editor visual drag-and-drop de camadas sobre a foto base.
// - Foto de fundo: fixa, imutável (imagem gerada pela IA / Pexels)
// - Cada camada por cima é arrastável com o mouse
// - Clique numa camada seleciona; painel lateral mostra propriedades (texto, cor, tamanho)
// - Ao salvar, layers_json é persistido no generated_assets

import * as React from "react";
import type { Layer, LayerComposition, LayerId } from "./layer-types";

interface Props {
  imageUrl: string;
  composition: LayerComposition;
  onChange: (composition: LayerComposition) => void;
}

export function LayerEditor({ imageUrl, composition, onChange }: Props) {
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = React.useState<LayerId | null>(null);
  const [displayScale, setDisplayScale] = React.useState(1);

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

  const selected = composition.layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
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
          if (e.target === e.currentTarget) setSelectedId(null);
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
            scale={displayScale}
            canvasWidth={composition.canvasWidth}
            canvasHeight={composition.canvasHeight}
            onSelect={() => setSelectedId(layer.id)}
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
          Clique em qualquer texto ou elemento pra editar
        </div>
      )}
    </div>
  );
}

// ─── LayerNode: elemento arrastável ─────────────────────────────────

interface LayerNodeProps {
  layer: Layer;
  selected: boolean;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: () => void;
  onUpdate: (patch: Partial<Layer>) => void;
}

function LayerNode(props: LayerNodeProps) {
  const { layer, selected, scale, canvasWidth, canvasHeight, onSelect, onUpdate } = props;
  const dragState = React.useRef<{ startX: number; startY: number; layerX: number; layerY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (layer.locked) return;
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

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left: `${(layer.x / canvasWidth) * 100}%`,
    top: `${(layer.y / canvasHeight) * 100}%`,
    cursor: layer.locked ? "default" : "move",
    outline: selected ? "2px dashed #3654FF" : "none",
    outlineOffset: 2,
  };

  if (layer.type === "text") {
    return (
      <div
        onMouseDown={handleMouseDown}
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
        onMouseDown={handleMouseDown}
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
        onMouseDown={handleMouseDown}
        style={{
          ...commonStyle,
          width: layer.width * scale,
          height: layer.height * scale,
          background: layer.bg,
          opacity: layer.opacity ?? 1,
          borderRadius: layer.radius ? layer.radius * scale : 0,
        }}
      />
    );
  }

  if (layer.type === "line") {
    return (
      <div
        onMouseDown={handleMouseDown}
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
