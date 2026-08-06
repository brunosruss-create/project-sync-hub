// Primitivas visuais reutilizáveis pelos templates.
// Cada função retorna ReactElement — Satori consome JSX estático.
// IMPORTANTE: Satori suporta um subset limitado de CSS:
//   - flex ✓, grid ✗
//   - border-radius ✓, mask/clip-path ✗
//   - box-shadow ✓ (mas limitado a 1 shadow simples)
//   - linear-gradient em background ✓
//   - filter: blur ✗
// Simulamos "sombras" e "molduras" com divs sobrepostas com opacity.

import type { CSSProperties, ReactElement } from "react";
import type { BrandKit } from "../types";

// ─── BADGES ─────────────────────────────────────────────────────

/** Pill colorida no topo tipo "OFERTA · SAÚDE · NOVIDADE".
 * Nota: Satori não suporta `width: fit-content` — o container tem que
 * definir o layout (ex.: usar `alignSelf: "flex-start"` no wrapper).
 */
export function pillBadge(props: {
  text: string;
  bgColor: string;
  textColor?: string;
  fontFamily: string;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        paddingLeft: 22,
        paddingRight: 22,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: props.bgColor,
        color: props.textColor ?? "#FFFFFF",
        fontFamily: props.fontFamily,
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 4,
        textTransform: "uppercase",
        borderRadius: 999,
      }}
    >
      {props.text}
    </div>
  );
}

/** Badge de categoria estilo "outline" — mais discreto. */
export function outlineBadge(props: {
  text: string;
  color: string;
  fontFamily: string;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        paddingLeft: 18,
        paddingRight: 18,
        paddingTop: 6,
        paddingBottom: 6,
        borderColor: props.color,
        borderWidth: 2,
        borderStyle: "solid",
        color: props.color,
        fontFamily: props.fontFamily,
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 3,
        textTransform: "uppercase",
        borderRadius: 999,
      }}
    >
      {props.text}
    </div>
  );
}

// ─── PHOTO FRAMES ───────────────────────────────────────────────

/** Foto com máscara arredondada + moldura de acento. */
export function framedPhoto(props: {
  url: string | undefined;
  width: number;
  height: number;
  borderColor: string;
  borderWidth?: number;
  borderRadius?: number;
  fallbackBg: string;
}): ReactElement {
  const radius = props.borderRadius ?? 32;
  const border = props.borderWidth ?? 6;
  if (!props.url) {
    return (
      <div
        style={{
          width: props.width,
          height: props.height,
          borderRadius: radius,
          backgroundColor: props.fallbackBg,
          display: "flex",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: props.width,
        height: props.height,
        borderRadius: radius,
        borderColor: props.borderColor,
        borderWidth: border,
        borderStyle: "solid",
        display: "flex",
        overflow: "hidden",
        backgroundColor: props.fallbackBg,
      }}
    >
      <img
        src={props.url}
        width={props.width - border * 2}
        height={props.height - border * 2}
        style={{
          width: props.width - border * 2,
          height: props.height - border * 2,
          objectFit: "cover",
          borderRadius: radius - border,
        }}
      />
    </div>
  );
}

/** Foto redonda estilo avatar. */
export function circlePhoto(props: {
  url: string | undefined;
  size: number;
  borderColor?: string;
  borderWidth?: number;
  fallbackBg: string;
}): ReactElement {
  const border = props.borderWidth ?? 0;
  if (!props.url) {
    return (
      <div
        style={{
          width: props.size,
          height: props.size,
          borderRadius: 999,
          backgroundColor: props.fallbackBg,
          display: "flex",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: props.size,
        height: props.size,
        borderRadius: 999,
        borderColor: props.borderColor ?? "transparent",
        borderWidth: border,
        borderStyle: "solid",
        display: "flex",
        overflow: "hidden",
        backgroundColor: props.fallbackBg,
      }}
    >
      <img
        src={props.url}
        width={props.size - border * 2}
        height={props.size - border * 2}
        style={{
          width: props.size - border * 2,
          height: props.size - border * 2,
          objectFit: "cover",
          borderRadius: 999,
        }}
      />
    </div>
  );
}

/** Foto full-bleed com overlay de gradiente sobreposto (pra legibilidade de texto). */
export function fullBleedPhoto(props: {
  url: string | undefined;
  width: number;
  height: number;
  overlayColor: string;
  overlayOpacity?: number;
  fallbackBg: string;
}): ReactElement {
  const overlayOp = props.overlayOpacity ?? 0.55;
  return (
    <>
      {props.url ? (
        <img
          src={props.url}
          width={props.width}
          height={props.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: props.width,
            height: props.height,
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: props.width,
            height: props.height,
            backgroundColor: props.fallbackBg,
            display: "flex",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: props.width,
          height: props.height,
          backgroundColor: props.overlayColor,
          opacity: overlayOp,
          display: "flex",
        }}
      />
    </>
  );
}

// ─── DECORATIVOS ────────────────────────────────────────────────

/** Linha decorativa horizontal grossa. */
export function accentLine(props: {
  color: string;
  width: number;
  height?: number;
}): ReactElement {
  return (
    <div
      style={{
        width: props.width,
        height: props.height ?? 4,
        backgroundColor: props.color,
        display: "flex",
        borderRadius: 4,
      }}
    />
  );
}

/** Assinatura da marca — usado no topo/rodapé. */
export function brandSignature(props: {
  text: string;
  color: string;
  fontFamily: string;
  fontSize?: number;
}): ReactElement {
  return (
    <div
      style={{
        fontFamily: props.fontFamily,
        fontSize: props.fontSize ?? 22,
        fontWeight: 700,
        letterSpacing: 5,
        textTransform: "uppercase",
        color: props.color,
        display: "flex",
      }}
    >
      {props.text}
    </div>
  );
}

// ─── UTILS ──────────────────────────────────────────────────────

export function brandSig(brandKit: BrandKit, fallback = "Sua Marca"): string {
  return brandKit.defaultSignature?.trim() || fallback;
}

/** Aplica opacidade em uma cor hex — retorna rgba. Útil pra overlays. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const cardShadowStyle: CSSProperties = {
  boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
};
