// Módulo de validação de posts por rede/Post_Type.
// Função pura — sem I/O, sem dependência de banco. Exportável tanto pro server
// (gate antes de enviar à Zernio) quanto pro client (preview em tempo real).
//
// Os limites são hardcoded com base na documentação oficial das APIs de cada
// rede (Meta Graph API, Instagram Graph API, TikTok Content Posting API,
// YouTube Data API v3) via Zernio. Devem ser revisados se as plataformas
// alterarem seus limites publicamente documentados.

export type SocialPlatform = "facebook" | "instagram" | "tiktok" | "youtube";

export type PostType =
  | "feed"
  | "reels"
  | "stories"
  | "carousel"
  | "story"
  | "reel"
  | "video"
  | "short"
  | "photo_carousel";

export type MediaType = "image" | "video";

export type PlatformLimits = {
  platform: SocialPlatform;
  postType: PostType;
  /** Limite de caracteres da legenda/descrição. YouTube: descrição (título tem campo separado). */
  charLimit: number;
  /** Limite de caracteres do título (YouTube/TikTok photo_carousel). Null se não se aplica. */
  titleLimit: number | null;
  /** Tipos de mídia aceitos. */
  mediaTypes: MediaType[];
  /** Mínimo de itens de mídia. 0 = texto-only é permitido. */
  minMedia: number;
  /** Máximo de itens de mídia. */
  maxMedia: number;
  /** Pode misturar imagem e vídeo no mesmo post? */
  mixedMedia: boolean;
  /** Duração máxima de vídeo em segundos. Null se não limita (YouTube video). */
  maxVideoDurationSec: number | null;
  /** Formatos de imagem aceitos. */
  imageFormats: string[];
  /** Formatos de vídeo aceitos. */
  videoFormats: string[];
};

// ============================================================
// Tabela de limites (fonte única de verdade)
// ============================================================

export const PLATFORM_LIMITS: PlatformLimits[] = [
  // ─── Facebook ────────────────────────────────────
  {
    platform: "facebook",
    postType: "feed",
    charLimit: 50_000,
    titleLimit: null,
    mediaTypes: ["image", "video"],
    minMedia: 0,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: null,
    imageFormats: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  {
    platform: "facebook",
    postType: "reels",
    charLimit: 50_000,
    titleLimit: null,
    mediaTypes: ["video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 60,
    imageFormats: [],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  {
    platform: "facebook",
    postType: "stories",
    charLimit: 50_000,
    titleLimit: null,
    mediaTypes: ["image", "video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 60,
    imageFormats: ["image/jpeg", "image/png"],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  // ─── Instagram ───────────────────────────────────
  {
    platform: "instagram",
    postType: "feed",
    charLimit: 2200,
    titleLimit: null,
    mediaTypes: ["image", "video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 3600,
    imageFormats: ["image/jpeg", "image/png"],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  {
    platform: "instagram",
    postType: "carousel",
    charLimit: 2200,
    titleLimit: null,
    mediaTypes: ["image", "video"],
    minMedia: 2,
    maxMedia: 10,
    mixedMedia: true,
    maxVideoDurationSec: 3600,
    imageFormats: ["image/jpeg", "image/png"],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  {
    platform: "instagram",
    postType: "story",
    charLimit: 2200,
    titleLimit: null,
    mediaTypes: ["image", "video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 60,
    imageFormats: ["image/jpeg", "image/png"],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  {
    platform: "instagram",
    postType: "reel",
    charLimit: 2200,
    titleLimit: null,
    mediaTypes: ["video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 90,
    imageFormats: [],
    videoFormats: ["video/mp4", "video/quicktime"],
  },
  // ─── TikTok ──────────────────────────────────────
  {
    platform: "tiktok",
    postType: "video",
    charLimit: 2200,
    titleLimit: null,
    mediaTypes: ["video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 600,
    imageFormats: [],
    videoFormats: ["video/mp4", "video/quicktime", "video/webm"],
  },
  {
    platform: "tiktok",
    postType: "photo_carousel",
    charLimit: 4000,
    titleLimit: 90,
    mediaTypes: ["image"],
    minMedia: 2,
    maxMedia: 35,
    mixedMedia: false,
    maxVideoDurationSec: null,
    imageFormats: ["image/jpeg", "image/png", "image/webp"],
    videoFormats: [],
  },
  // ─── YouTube ─────────────────────────────────────
  {
    platform: "youtube",
    postType: "video",
    charLimit: 5000,
    titleLimit: 100,
    mediaTypes: ["video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: null, // sem limite prático (12h p/ canais verificados)
    imageFormats: [],
    videoFormats: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-flv", "video/3gpp"],
  },
  {
    platform: "youtube",
    postType: "short",
    charLimit: 5000,
    titleLimit: 100,
    mediaTypes: ["video"],
    minMedia: 1,
    maxMedia: 1,
    mixedMedia: false,
    maxVideoDurationSec: 180,
    imageFormats: [],
    videoFormats: ["video/mp4", "video/quicktime", "video/webm"],
  },
];

// ============================================================
// Helpers
// ============================================================

/** Retorna os Post_Types suportados por uma rede. */
export function getSupportedPostTypes(platform: SocialPlatform): PostType[] {
  return PLATFORM_LIMITS.filter((l) => l.platform === platform).map((l) => l.postType);
}

/** Retorna os limites de um par (platform, postType). Null se não suportado. */
export function getLimits(platform: SocialPlatform, postType: PostType): PlatformLimits | null {
  return PLATFORM_LIMITS.find((l) => l.platform === platform && l.postType === postType) ?? null;
}

// ============================================================
// Validação
// ============================================================

export type ValidationViolation = {
  constraint: "char_limit" | "title_limit" | "format" | "resolution" | "duration" | "count" | "mixed_media" | "post_type_unsupported" | "media_required";
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  violations: ValidationViolation[];
};

export type PostTargetInput = {
  platform: SocialPlatform;
  postType: PostType | null;
  text: string;
  title?: string;
  mediaItems: Array<{ type: MediaType; mime?: string; durationSec?: number }>;
};

/**
 * Valida um Post_Target contra os limites da rede/Post_Type.
 * Retorna lista de violações (vazia = válido).
 */
export function validatePostTarget(target: PostTargetInput): ValidationResult {
  const violations: ValidationViolation[] = [];

  if (!target.postType) {
    violations.push({
      constraint: "post_type_unsupported",
      message: "Selecione um tipo de publicação antes de agendar ou publicar.",
    });
    return { valid: false, violations };
  }

  const limits = getLimits(target.platform, target.postType);
  if (!limits) {
    violations.push({
      constraint: "post_type_unsupported",
      message: `O tipo "${target.postType}" não é suportado no ${target.platform}.`,
    });
    return { valid: false, violations };
  }

  // Limite de caracteres (texto/descrição)
  if (target.text.length > limits.charLimit) {
    violations.push({
      constraint: "char_limit",
      message: `O texto excede o limite de ${limits.charLimit} caracteres (${target.text.length} usados).`,
    });
  }

  // Limite de caracteres do título
  if (limits.titleLimit && target.title && target.title.length > limits.titleLimit) {
    violations.push({
      constraint: "title_limit",
      message: `O título excede o limite de ${limits.titleLimit} caracteres (${target.title.length} usados).`,
    });
  }

  // Contagem de mídia
  if (target.mediaItems.length < limits.minMedia) {
    violations.push({
      constraint: limits.minMedia > 0 ? "media_required" : "count",
      message: `Este tipo de publicação exige pelo menos ${limits.minMedia} item(s) de mídia.`,
    });
  }
  if (target.mediaItems.length > limits.maxMedia) {
    violations.push({
      constraint: "count",
      message: `Máximo de ${limits.maxMedia} item(s) de mídia para ${target.postType} no ${target.platform}. Você tem ${target.mediaItems.length}.`,
    });
  }

  // Tipos de mídia permitidos
  for (const item of target.mediaItems) {
    if (!limits.mediaTypes.includes(item.type)) {
      violations.push({
        constraint: "format",
        message: `${target.platform} (${target.postType}) não aceita ${item.type}. Aceita apenas: ${limits.mediaTypes.join(", ")}.`,
      });
      break; // uma violação de formato é suficiente
    }
  }

  // Mixar imagem e vídeo
  if (!limits.mixedMedia && target.mediaItems.length > 1) {
    const types = new Set(target.mediaItems.map((m) => m.type));
    if (types.size > 1) {
      violations.push({
        constraint: "mixed_media",
        message: `${target.platform} (${target.postType}) não permite misturar fotos e vídeos no mesmo post.`,
      });
    }
  }

  // Formato de mídia (mime type)
  for (const item of target.mediaItems) {
    if (item.mime) {
      const allowed = item.type === "image" ? limits.imageFormats : limits.videoFormats;
      if (allowed.length > 0 && !allowed.includes(item.mime.toLowerCase())) {
        violations.push({
          constraint: "format",
          message: `Formato "${item.mime}" não é aceito para ${item.type} no ${target.platform} (${target.postType}). Aceitos: ${allowed.join(", ")}.`,
        });
        break;
      }
    }
  }

  // Duração de vídeo
  if (limits.maxVideoDurationSec) {
    for (const item of target.mediaItems) {
      if (item.type === "video" && item.durationSec && item.durationSec > limits.maxVideoDurationSec) {
        violations.push({
          constraint: "duration",
          message: `Vídeo excede a duração máxima de ${limits.maxVideoDurationSec}s para ${target.postType} no ${target.platform} (${item.durationSec}s).`,
        });
        break;
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/** Labels amigáveis dos Post_Types pra UI. */
export const POST_TYPE_LABELS: Record<PostType, string> = {
  feed: "Feed",
  reels: "Reels",
  stories: "Stories",
  carousel: "Carrossel",
  story: "Story",
  reel: "Reel",
  video: "Vídeo",
  short: "Short",
  photo_carousel: "Carrossel de Fotos",
};

/** Labels amigáveis das plataformas. */
export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};
