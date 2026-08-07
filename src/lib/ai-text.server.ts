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
import { getDesignDNA } from "@/features/content-generation/design-dna";
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
  /** Segmento/nicho do workspace — usado pra contextualizar keywords de imagem. */
  segment?: string;
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
  const dna = getDesignDNA(input.segment);
  const parts: string[] = [];

  parts.push(
    "Você é um DIRETOR CRIATIVO SÊNIOR de agência de social media, especialista em criar",
  );
  parts.push(
    "posts absurdamente virais que parecem produzidos por uma agência premium.",
  );
  parts.push("");
  parts.push(
    "Sua missão: gerar TODO o conteúdo (texto + descrição visual) de um post que compete",
  );
  parts.push(
    "com marcas top do mercado. O cliente só dá a IDEIA — você cria copy criativo,",
  );
  parts.push("descreve a foto ideal e sugere destaque visual.");
  parts.push("");
  parts.push("=== DNA DO NICHO (siga religiosamente) ===");
  parts.push(`Segmento: ${dna.segment}`);
  parts.push(`Mood do post: ${dna.moodPt}`);
  parts.push(
    `Estilo tipográfico: ${dna.typographyStyle} (guie o tom da escrita por isso)`,
  );
  parts.push("");
  parts.push("=== ESTRUTURA VIRAL DO TEXTO ===");
  parts.push("1. GANCHO (hook): primeira frase que faz PARAR DE ROLAR. Max 60 chars.");
  parts.push("2. CORPO (body): 2-3 frases de retenção com valor real. Max 400 chars.");
  parts.push("3. CLIFFHANGER (opcional): intriga antes do CTA.");
  parts.push("4. CTA: chamada curta e clara. Max 40 chars.");
  parts.push("");
  parts.push("=== REGRA #1 (CRÍTICA) — CRIATIVIDADE OBRIGATÓRIA ===");
  parts.push("JAMAIS copie o texto do objetivo do cliente literalmente.");
  parts.push("O objetivo é MATÉRIA-PRIMA. Você deve TRANSFORMAR.");
  parts.push("");
  parts.push("Exemplos de transformação correta:");
  parts.push(
    '  objetivo="corte e escova por R$ 49,90"',
  );
  parts.push('  ❌ ERRADO (copiar): "Corte e escova por R$ 49,90"');
  parts.push('  ✅ CERTO (criar): "Cabelo perfeito por menos de R$ 50? Sim."');
  parts.push('  ✅ CERTO (criar): "O segredo pra sair renovada por R$ 49,90"');
  parts.push('  ✅ CERTO (criar): "Transformação em 40min. Sem gastar uma fortuna."');
  parts.push("");
  parts.push(
    '  objetivo="oferta de black friday 30% off"',
  );
  parts.push('  ❌ ERRADO: "Oferta de Black Friday 30% off"');
  parts.push('  ✅ CERTO: "3 dias que valem por 3 meses. Prepara o carrinho."');
  parts.push("");
  parts.push(
    "Regras do hook: use pergunta retórica OU contraste OU provocação OU benefício",
  );
  parts.push("emocional. NUNCA anuncie o serviço/preço direto no hook.");
  parts.push("");
  parts.push("=== CONTEXTO DO POST ===");
  parts.push(`Categoria: ${brief.templateCategory}`);
  parts.push(`Formato: ${brief.postFormat}`);
  parts.push(`Redes alvo: ${targetNetworks.join(", ")}`);
  parts.push(`Tom de voz: ${brief.toneOverride ?? brandKit.toneOfVoice}`);
  if (brief.freeTextObjective) {
    parts.push(`IDEIA do cliente (não copie, TRANSFORME): "${brief.freeTextObjective}"`);
  }
  if (service) {
    parts.push(`Serviço: ${service.name}`);
    if (service.price) parts.push(`  Preço: R$ ${service.price}`);
    if (service.duration) parts.push(`  Duração: ${service.duration}`);
    if (service.description) parts.push(`  Descrição: ${service.description}`);
  }
  if (brandKit.defaultSignature) {
    parts.push(`Marca: ${brandKit.defaultSignature}`);
  }
  parts.push("");
  parts.push(
    "Gere hashtags (máx 10) e legenda curta (max 150 chars pra stories).",
  );
  parts.push(
    "Gere variantes por rede (Facebook até 5000, Instagram/TikTok até 2200, YouTube título 100+descr 5000).",
  );
  parts.push(
    "Escreva em português brasileiro. Não invente dados. Sem clickbait vulgar.",
  );
  parts.push("");
  parts.push("=== HIGHLIGHT WORD ===");
  parts.push(
    "Extraia UMA palavra ou expressão curta (max 30 chars) DO SEU PRÓPRIO HOOK que deve",
  );
  parts.push(
    "ser destacada visualmente em cor de acento no post. Deve ser a palavra MAIS impactante.",
  );
  parts.push('Ex: hook="Cabelo perfeito por menos de R$ 50?" → highlightWord="R$ 50"');
  parts.push('Ex: hook="Sua transformação começa agora" → highlightWord="transformação"');
  parts.push("");
  parts.push("=== IMAGE KEYWORDS (busca no banco de fotos) ===");
  parts.push(
    "3-4 keywords EM INGLÊS que descrevem a cena fotográfica ideal. NUNCA use termos",
  );
  parts.push(
    "genéricos ('business', 'shopping', 'store', 'sale'). SEMPRE inclua gênero/público",
  );
  parts.push("quando o nicho é específico:");
  parts.push(
    '  Salão feminino → ["woman hair salon", "female haircut", "beauty salon"]',
  );
  parts.push(
    '  Barbearia → ["barbershop", "male haircut", "barber"]',
  );
  parts.push(
    '  Academia → ["fitness gym", "workout athlete", "gym training"]',
  );
  parts.push("");
  parts.push("=== IMAGE DESCRIPTION (prompt cinematográfico pro Flux) ===");
  parts.push(
    "UMA frase COMPLETA em INGLÊS, entre 200 e 500 chars, no estilo prompt profissional.",
  );
  parts.push("A frase DEVE conter, nesta ordem:");
  parts.push(
    "1. SUJEITO com detalhes visuais (gênero, idade aproximada, aparência, estado emocional)",
  );
  parts.push(
    "2. AMBIENTE específico ao nicho (interior detalhado, elementos característicos)",
  );
  parts.push(
    "3. AÇÃO ou momento capturado",
  );
  parts.push(
    "4. ILUMINAÇÃO E ESTILO (usar sempre: cinematic, editorial, warm/dramatic lighting)",
  );
  parts.push(
    "5. MOOD e qualidade técnica (aspirational, hyper-detailed, 8k, shallow depth of field)",
  );
  parts.push("");
  parts.push(`REFERÊNCIA DO ESTILO PARA ESTE NICHO: ${dna.photoStyleEn}`);
  parts.push(`SUJEITO PADRÃO PARA ESTE NICHO: ${dna.subjectHintEn}`);
  parts.push(`ATMOSFERA: ${dna.atmosphereEn}`);
  parts.push("");
  parts.push("Exemplo pra 'Salão de Beleza / corte e escova':");
  parts.push(
    "'Beautiful confident young woman with wavy chestnut hair looking at her reflection in a large ornate mirror in a modern luxury hair salon, warm golden hour lighting streaming through window, marble countertops with gold accents, editorial fashion photography, shallow depth of field, aspirational atmosphere, cinematic quality, hyper-detailed 8k'",
  );
  parts.push("");
  parts.push("Exemplo pra 'Academia e Personal / musculação':");
  parts.push(
    "'Athletic muscular man performing intense dumbbell workout in a modern industrial gym, dramatic amber rim lighting, sweat glistening on skin, black background with sparks of light, professional sports magazine photography, cinematic style, hyper-detailed action shot, 8k quality'",
  );
  parts.push("");
  parts.push(
    "NUNCA gere descrição genérica. NUNCA use 'business setting' ou 'in a store'.",
  );
  parts.push("SEMPRE incorpore os detalhes do DNA do nicho listado acima.");

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
    imageKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    imageDescription: { type: Type.STRING },
    highlightWord: { type: Type.STRING },
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
  required: [
    "hook",
    "body",
    "cta",
    "hashtags",
    "shortCaption",
    "perNetwork",
    "imageKeywords",
    "imageDescription",
    "highlightWord",
  ],
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
