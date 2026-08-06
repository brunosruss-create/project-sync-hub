// AI_Image_Provider — geração de imagem por IA.
// Provedor principal: Flux Schnell via fal.ai (barato: ~$0.003/megapixel).
// Fallback secundário: Google Imagen via Gemini API (mais caro, usado só se
// a fal.ai falhar ou não estiver configurada).
//
// Usado como fallback do Image_Bank (Pexels/Unsplash/Pixabay) quando o banco
// não retorna resultado adequado. Requirements 5.1, 5.2.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadGeminiCredentials } from "@/lib/ai-credentials.server";

const BUCKET = "ai-content";

export interface GenerateImageInput {
  prompt: string;
  aspectRatio: "1:1" | "9:16" | "16:9";
  brandColorHint?: string;
  workspaceOwnerId: string;
}

export interface GenerateImageOutput {
  url: string;
  promptUsed: string;
  model: string;
}

function enrichPrompt(input: GenerateImageInput): string {
  const parts = [input.prompt];
  if (input.brandColorHint) {
    parts.push(`Color palette accent: ${input.brandColorHint}.`);
  }
  parts.push(
    "Professional photography, natural lighting, high quality, realistic, commercial photo style.",
  );
  return parts.join(" ");
}

async function uploadToBucket(
  bytes: Buffer,
  workspaceOwnerId: string,
  contentType = "image/png",
): Promise<string> {
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  const key = `${workspaceOwnerId}/ai-generated/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType, upsert: false });
  if (upErr) {
    throw new Error(`Falha ao subir imagem AI: ${upErr.message}`);
  }
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

// ─── Provedor principal: Flux Schnell via Together.ai ─────────────

const TOGETHER_MODEL = "black-forest-labs/FLUX.1-schnell";

/** Together.ai aceita width/height em pixels diretamente (múltiplos de 8, máx 1792). */
function togetherDimensions(
  aspectRatio: GenerateImageInput["aspectRatio"],
): { width: number; height: number } {
  if (aspectRatio === "9:16") return { width: 768, height: 1344 };
  if (aspectRatio === "16:9") return { width: 1344, height: 768 };
  return { width: 1024, height: 1024 };
}

async function generateWithTogether(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    const err = new Error("TOGETHER_API_KEY não configurada");
    (err as { code?: string }).code = "TOGETHER_NOT_CONFIGURED";
    throw err;
  }

  const finalPrompt = enrichPrompt(input);
  const { width, height } = togetherDimensions(input.aspectRatio);

  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      prompt: finalPrompt,
      width,
      height,
      steps: 4, // Schnell é otimizado pra poucos steps (rápido e barato)
      n: 1,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Together.ai retornou ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const image = json.data?.[0];
  if (!image?.url && !image?.b64_json) {
    throw new Error("Together.ai retornou payload sem imagem");
  }

  let bytes: Buffer;
  let contentType = "image/png";
  if (image.url) {
    const imgRes = await fetch(image.url);
    if (!imgRes.ok) {
      throw new Error(`Falha ao baixar imagem gerada: HTTP ${imgRes.status}`);
    }
    bytes = Buffer.from(await imgRes.arrayBuffer());
    contentType = imgRes.headers.get("content-type") ?? contentType;
  } else {
    bytes = Buffer.from(image.b64_json!, "base64");
  }

  const url = await uploadToBucket(bytes, input.workspaceOwnerId, contentType);
  return { url, promptUsed: finalPrompt, model: "flux-schnell-together" };
}

// ─── Fallback secundário: Google Imagen via Gemini API ────────────

async function generateWithImagen(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { GoogleGenAI } = await import("@google/genai");
  const creds = await loadGeminiCredentials();
  const client = new GoogleGenAI({ apiKey: creds.apiKey });
  const model = "imagen-3.0-generate-002";
  const finalPrompt = enrichPrompt(input);

  const response = await client.models.generateImages({
    model,
    prompt: finalPrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: input.aspectRatio,
    },
  });

  const first = response.generatedImages?.[0];
  const inlineData = first?.image?.imageBytes;
  if (!inlineData) {
    throw new Error("Imagen retornou payload vazio");
  }

  const bytes = Buffer.from(inlineData, "base64");
  const url = await uploadToBucket(bytes, input.workspaceOwnerId, "image/png");

  return { url, promptUsed: finalPrompt, model };
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Gera uma imagem via IA e sobe pro bucket ai-content. Retorna URL pública.
 * Tenta fal.ai (Flux Schnell, barato) primeiro; se falhar, cai pra Imagen.
 * NÃO consulta Plan_Quota_Hook — quem chamar deve fazer isso antes.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageOutput> {
  try {
    return await generateWithTogether(input);
  } catch (togetherErr) {
    console.warn(
      `[ai-image] Together.ai falhou, tentando Imagen: ${(togetherErr as Error).message}`,
    );
    try {
      return await generateWithImagen(input);
    } catch (imagenErr) {
      const err = new Error(
        `Ambos provedores de imagem falharam. Together.ai: ${(togetherErr as Error).message} | Imagen: ${(imagenErr as Error).message}`,
      );
      (err as { code?: string }).code = "AI_IMAGE_NOT_CONFIGURED";
      throw err;
    }
  }
}
