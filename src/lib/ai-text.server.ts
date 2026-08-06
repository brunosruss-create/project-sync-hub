// Cliente AI_Text_Provider — usa Gemini Flash para gerar Copy_Bundles
// com estrutura viral (gancho → retenção → cliff → CTA).
//
// Chama Gemini via SDK oficial @google/genai com responseSchema forçando
// JSON estruturado. Zod valida a resposta antes de devolver.

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import type {
  ContentBrief,
  BrandKit,
  CopyBundle,
  TargetNetwork,
} from "@/features/content-generation/types";
import { CopyBundleSchema } from "@/features/content-generation/types";
import { loadGeminiCredentials } from "@/lib/ai-credentials.server";

// Termos vetados na moderação básica. Lista pequena e conservadora; pode ser
// expandida ou substituída por um provedor de moderação real em fase futura.
const BLOCKED_TERMS = [
  "arma", "matar", "cocaína", "cocaina", "heroína", "heroina",
  "estupro", "suicídio", "suicidio", "pornô", "pornografia",
];

export interface CopyBundleInput {
  brief: ContentBrief;
  brandKit: BrandKit;
  service: {
    name: string;
    price?: string | number | null;
    duration?: string | null;
    description?: string | null;
  } | null;
  targetNetworks: TargetNetwork[];
}

export interface GenerateCopyOutput {
  bundle: CopyBundle;
  model: string;
  promptUsed: string;
}

async function getClientAndModel(): Promise<{ client: GoogleGenAI; model: string }> {
  const creds = await loadGeminiCredentials();
  return {
    client: new GoogleGenAI({ apiKey: creds.apiKey }),
    model: creds.model,
  };
}

function buildViralPrompt(input: CopyBundleInput): string {
  const { brief, brandKit, service, targetNetworks } = input;
  const parts: string[] = [];

  parts.push("Você é um redator especialista em conteúdo viral para redes sociais.");
  parts.push(
    "Sua tarefa é criar uma legenda completa aplicando estrutura viral:",
  );
  parts.push("1. GANCHO: primeira frase impactante que faz parar de rolar (max 60 chars).");
  parts.push("2. CORPO: 2-3 frases que retêm atenção com valor real.");
  parts.push(
    "3. CLIFFHANGER (opcional): frase de intriga antes do CTA (usar só se fizer sentido).",
  );
  parts.push("4. CTA: chamada de ação clara e curta (max 40 chars).");
  parts.push("");
  parts.push(`Categoria do post: ${brief.templateCategory}`);
  parts.push(`Formato: ${brief.postFormat}`);
  parts.push(`Redes alvo: ${targetNetworks.join(", ")}`);
  parts.push(
    `Tom de voz: ${brief.toneOverride ?? brandKit.toneOfVoice}`,
  );
  if (brief.freeTextObjective) {
    parts.push(`Objetivo do post: ${brief.freeTextObjective}`);
  }
  if (service) {
    parts.push(`Serviço em destaque: ${service.name}`);
    if (service.price) parts.push(`  Preço: R$ ${service.price}`);
    if (service.duration) parts.push(`  Duração: ${service.duration}`);
    if (service.description) parts.push(`  Descrição: ${service.description}`);
  }
  if (brandKit.defaultSignature) {
    parts.push(`Assinatura da marca: ${brandKit.defaultSignature}`);
  }
  parts.push("");
  parts.push("Gere hashtags relevantes (máx 10), uma legenda curta (para stories, max 150 chars)");
  parts.push("e a variante completa por rede (Facebook: até 5000 chars; Instagram/TikTok: até");
  parts.push("2200; YouTube: título até 100 + descrição até 5000).");
  parts.push("Escreva em português brasileiro. Não invente informações não fornecidas.");
  parts.push("Não use jargões pesados nem clickbait vulgar.");

  return parts.join("\n");
}

// Schema em formato Gemini responseSchema. Estrutura compatível com CopyBundle.
const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hook: { type: Type.STRING },
    body: { type: Type.STRING },
    cliffhanger: { type: Type.STRING },
    cta: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    shortCaption: { type: Type.STRING },
    perNetwork: {
      type: Type.OBJECT,
      properties: {
        facebook: {
          type: Type.OBJECT,
          properties: { fullText: { type: Type.STRING } },
        },
        instagram: {
          type: Type.OBJECT,
          properties: { fullText: { type: Type.STRING } },
        },
        tiktok: {
          type: Type.OBJECT,
          properties: { fullText: { type: Type.STRING } },
        },
        youtube: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
          },
        },
      },
    },
  },
  required: ["hook", "body", "cta", "hashtags", "shortCaption", "perNetwork"],
};

export function moderateCopy(bundle: CopyBundle): void {
  const haystack = [
    bundle.hook,
    bundle.body,
    bundle.cliffhanger ?? "",
    bundle.cta,
    bundle.shortCaption,
    ...bundle.hashtags,
  ]
    .join(" ")
    .toLowerCase();
  const hit = BLOCKED_TERMS.find((t) => haystack.includes(t));
  if (hit) {
    throw new Error(`Conteúdo bloqueado por moderação (termo: "${hit}")`);
  }
}

/**
 * Gera um Copy_Bundle estruturado via Gemini Flash.
 * Rejeita respostas malformadas ou moderadas.
 */
export async function generateCopyBundle(
  input: CopyBundleInput,
): Promise<GenerateCopyOutput> {
  const { client, model } = await getClientAndModel();
  const prompt = buildViralPrompt(input);

  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      temperature: 0.9,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini retornou resposta vazia");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini retornou JSON inválido: ${(err as Error).message}`);
  }
  const parsed = CopyBundleSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(
      `Resposta do Gemini fora do schema: ${z.prettifyError(parsed.error)}`,
    );
  }
  moderateCopy(parsed.data);
  return {
    bundle: parsed.data,
    model,
    promptUsed: prompt,
  };
}
