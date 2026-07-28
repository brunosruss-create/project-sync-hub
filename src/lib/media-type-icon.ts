import { Image, Mic, Video, FileText, type LucideIcon } from "lucide-react";

export type MediaKind = "image" | "audio" | "video" | "document";

const ICON: Record<MediaKind, LucideIcon> = {
  image: Image,
  audio: Mic,
  video: Video,
  document: FileText,
};

/** Ícone de linha lucide-react pro tipo de mídia — nunca emoji. */
export function mediaTypeIcon(kind: MediaKind): LucideIcon {
  return ICON[kind];
}

/**
 * Detecta o tipo de mídia a partir do texto salvo como preview. Cobre 3
 * formatos: tag `[image]`, extensão de arquivo, e a palavra literal que o
 * webhook grava em contacts.last_message quando a mídia não tem legenda
 * (ver KIND_LABEL em routes/api/public/evolution.$instanceId.ts) — sem essa
 * terceira checagem, o ícone nunca aparecia pro caso mais comum (mídia sem
 * legenda), já que o texto persistido nunca batia com as duas primeiras.
 */
export function detectMediaKind(text: string): MediaKind | null {
  const t = (text ?? "").trim();
  if (/^\[image\]|\.(png|jpe?g|webp|gif)$/i.test(t) || /^imagem$/i.test(t)) return "image";
  if (/^\[audio\]|\.(ogg|mp3|m4a|wav)$/i.test(t) || /^áudio$/i.test(t)) return "audio";
  if (/^\[video\]|\.(mp4|mov|webm)$/i.test(t) || /^vídeo$/i.test(t)) return "video";
  if (/^\[file\]|\.(pdf|docx?|xlsx?|zip)$/i.test(t) || /^documento$/i.test(t)) return "document";
  return null;
}

const MEDIA_LABEL: Record<MediaKind, string> = {
  image: "Imagem",
  audio: "Mensagem de voz",
  video: "Vídeo",
  document: "Documento",
};

export function mediaKindLabel(kind: MediaKind): string {
  return MEDIA_LABEL[kind];
}
