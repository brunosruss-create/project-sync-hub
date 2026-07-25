import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAppointmentFromAI,
  createAppointmentBatchFromAI,
  rescheduleAppointmentFromAI,
  cancelAppointmentFromAI,
  sendServicePhotoFromAI,
} from "@/lib/booking-confirmation.server";
import {
  extractAppointmentPayloads,
  extractJsonBlocks,
  stripProtocolBlocks,
} from "@/lib/appointment-json";

import { MESSAGE_DEFAULTS } from "@/lib/message-defaults";
import { normalizeHours, describeHours, type RawHours } from "@/lib/working-hours";
import { renderTemplate } from "@/lib/message-templates";
import { FIELD_LABELS } from "@/lib/field-labels";
import { GENERAL_INFO_LABELS } from "@/lib/general-info-labels";

type DayCfg = {
  enabled?: boolean;
  active?: boolean;
  start?: string;
  end?: string;
};
type WorkingHours = Record<string, DayCfg>;

// Mapeia índice 0..6 (domingo=0) para as várias chaves aceitas.
const DAY_KEYS: string[][] = [
  ["sunday", "sun", "dom", "domingo"],
  ["monday", "mon", "seg", "segunda", "segunda-feira"],
  ["tuesday", "tue", "ter", "terca", "terça", "terca-feira", "terça-feira"],
  ["wednesday", "wed", "qua", "quarta", "quarta-feira"],
  ["thursday", "thu", "qui", "quinta", "quinta-feira"],
  ["friday", "fri", "sex", "sexta", "sexta-feira"],
  ["saturday", "sat", "sab", "sábado", "sabado"],
];

function parseHM(v: string | undefined, fallback: number): number {
  if (!v || typeof v !== "string") return fallback;
  const [hStr, mStr] = v.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h)) return fallback;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

type PriceDisclosurePolicy = "always" | "on_request" | "never";

interface AiBehaviorConfig {
  ai_introduce_by_name: boolean;
  ai_declare_as_ai: boolean;
  ai_mention_business_name: boolean;
  ai_has_multiple_professionals: boolean;
  ai_price_disclosure_policy: PriceDisclosurePolicy;
  ai_can_reschedule: boolean;
  ai_can_cancel: boolean;
  ai_min_advance_hours: number;
  ai_required_fields: string[] | null;
  ai_custom_questions: string[];
  ai_max_questions_per_message: number;
  ai_can_share_contact_info: boolean;
}

export type AiRunInput = {
  workspace_owner_id: string;
  contact_id?: string | null;
  message: string;
  conversation_history?: { role: "user" | "assistant"; content: string }[];
  preview?: boolean;
  /** Stable id da mensagem do WhatsApp (m.key.id). Quando presente, é usado como dedup_key. */
  wa_message_id?: string | null;
  /** Nome do cliente (pushName do WhatsApp). Usado como default no agendamento. */
  contact_name?: string | null;
  /** Telefone do cliente (já é o WhatsApp). Usado como default no agendamento — IA não deve pedir. */
  contact_phone?: string | null;
  /** Áudio (base64 + mimeType) para Gemini processar nativamente. */
  audio?: { data: string; mimeType: string } | null;
  /** Resumo automático do histórico antigo do contato (memória de longo prazo). */
  ai_summary?: string | null;
};

export type AiRunResult =
  | { action: "skip"; reason: string }
  | { action: "send_out_of_hours"; response: string }
  | { action: "transfer_to_human"; response: string }
  | { action: "send_message"; response: string; tokens_total: number }
  | { action: "error"; error: string };

function isWithinHours(hours: WorkingHours | null | undefined, timezone: string): boolean {
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) {
    return true;
  }
  const tz = timezone || "America/Sao_Paulo";
  // Usa índice numérico do dia (0=domingo..6=sábado) — independente de locale.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wdShort = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();
  const SHORT_TO_IDX: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const dayIdx = SHORT_TO_IDX[wdShort] ?? new Date().getUTCDay();
  let hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  if (hh === 24) hh = 0;

  // Procura a config do dia tentando todas as chaves aceitas.
  const candidates = DAY_KEYS[dayIdx] ?? [];
  let cfg: DayCfg | undefined;
  let matchedKey: string | null = null;
  for (const k of candidates) {
    if (hours[k]) {
      cfg = hours[k];
      matchedKey = k;
      break;
    }
  }
  if (!cfg) {
    console.log("[ai hours] dia não configurado", {
      tz,
      dayIdx,
      wdShort,
      keys: Object.keys(hours),
    });
    return false;
  }
  const enabled = cfg.enabled ?? cfg.active ?? false;
  if (!enabled) {
    console.log("[ai hours] dia desativado", { tz, matchedKey });
    return false;
  }
  const startMin = parseHM(cfg.start, 0);
  const endMin = parseHM(cfg.end, 23 * 60 + 59);
  const nowMin = (hh % 24) * 60 + mm;
  const within = nowMin >= startMin && nowMin <= endMin;
  if (!within) {
    console.log("[ai hours] fora do intervalo", {
      tz,
      matchedKey,
      nowMin,
      startMin,
      endMin,
    });
  }
  return within;
}

const TONE_MAP: Record<string, string> = {
  amigavel: "Use linguagem cordial, próxima e acessível. Evite termos técnicos desnecessários.",
  amigável: "Use linguagem cordial, próxima e acessível. Evite termos técnicos desnecessários.",
  formal: "Use linguagem formal e profissional.",
  casual: "Use linguagem leve, casual e próxima. Pode usar expressões do dia a dia.",
  descontraido: "Use linguagem leve, casual e próxima. Pode usar expressões do dia a dia.",
  descontraído: "Use linguagem leve, casual e próxima. Pode usar expressões do dia a dia.",
  tecnico: "Use linguagem técnica e precisa. O cliente espera respostas especializadas.",
  técnico: "Use linguagem técnica e precisa. O cliente espera respostas especializadas.",
};

function buildWorkspaceLayer(
  p: Record<string, any> &
    Partial<AiBehaviorConfig> & {
      segment_default_required_fields?: string[];
      __is_first_message?: boolean;
    },
): string {
  const parts: string[] = [];
  const prohibitions: string[] = [];

  // === IDENTIDADE ===
  const name = p.ai_assistant_name as string | null | undefined;
  const business = p.business_name as string | null | undefined;
  const introduceByName = p.ai_introduce_by_name ?? true;
  const declareAsAi = p.ai_declare_as_ai ?? false;
  const mentionBusiness = p.ai_mention_business_name ?? true;
  const isFirst = p.__is_first_message ?? false;

  if (introduceByName && name) {
    parts.push(`Seu nome é ${name}.`);
    if (isFirst) {
      const intro =
        mentionBusiness && business
          ? `OBRIGATÓRIO: Esta é a primeira mensagem da conversa. Comece sua resposta se apresentando pelo nome ("${name}") e mencionando o negócio ("${business}"). Exemplo: "Olá! Eu sou a ${name}, do ${business}.".`
          : `OBRIGATÓRIO: Esta é a primeira mensagem da conversa. Comece sua resposta se apresentando pelo nome. Exemplo: "Olá! Eu sou a ${name}.".`;
      parts.push(intro);
    } else {
      parts.push(
        `Se o cliente perguntar seu nome ou quem é você, responda que é ${name}${mentionBusiness && business ? `, do ${business}` : ""}.`,
      );
    }
  } else {
    prohibitions.push(
      `OBRIGATÓRIO: NÃO se apresente pelo nome. Não diga "Eu sou X", "Meu nome é X", "Aqui é X". Vá direto ao ponto da mensagem do cliente.`,
    );
  }
  if (mentionBusiness && business) {
    parts.push(`Você atende o ${business}.`);
  } else if (!mentionBusiness && business) {
    prohibitions.push(
      `OBRIGATÓRIO: NÃO mencione o nome do negócio ("${business}") em nenhuma mensagem.`,
    );
  }
  if (declareAsAi) {
    parts.push(
      `Você é um assistente virtual. Se perguntado diretamente, confirme que é uma IA assistente do ${business ?? "negócio"}.`,
    );
  } else {
    parts.push(
      `Nunca mencione espontaneamente que é uma IA. Se perguntado diretamente, diga que é um assistente do ${business ?? "estabelecimento"}.`,
    );
  }

  // === DADOS DE CONTATO DO NEGÓCIO ===
  const canShareContact = (p as any).ai_can_share_contact_info !== false; // default true
  const street = ((p as any).business_street as string | null | undefined)?.trim();
  const num = ((p as any).business_address_number as string | null | undefined)?.trim();
  const complement = ((p as any).business_address_complement as string | null | undefined)?.trim();
  const neighborhood = ((p as any).business_neighborhood as string | null | undefined)?.trim();
  const city = ((p as any).business_city as string | null | undefined)?.trim();
  const stateUf = ((p as any).business_state as string | null | undefined)?.trim();
  const cep = ((p as any).business_cep as string | null | undefined)?.trim();
  const bizPhone = ((p as any).business_phone as string | null | undefined)?.trim();
  const bizSite = ((p as any).business_website as string | null | undefined)?.trim();
  const legacyAddress = ((p as any).business_address as string | null | undefined)?.trim();

  const addressLine = (() => {
    if (street) {
      let line = street;
      if (num) line += `, ${num}`;
      if (complement) line += ` — ${complement}`;
      if (neighborhood) line += ` — ${neighborhood}`;
      if (city) line += `, ${city}`;
      if (stateUf) line += `/${stateUf}`;
      if (cep) line += ` — CEP ${cep}`;
      return line;
    }
    return legacyAddress || "";
  })();

  const hasAnyContact = !!(addressLine || bizPhone || bizSite);

  if (canShareContact && hasAnyContact) {
    const lines: string[] = [
      "DADOS DE CONTATO DO NEGÓCIO (use APENAS se o cliente perguntar — não ofereça espontaneamente):",
    ];
    if (addressLine) lines.push(`- Endereço: ${addressLine}`);
    if (bizPhone) lines.push(`- Telefone: ${bizPhone}`);
    if (bizSite) lines.push(`- Site: ${bizSite}`);
    lines.push(
      "Quando perguntado sobre localização, telefone ou site, responda com a informação exata acima. Não invente, não complete dados faltantes — se o cliente pedir algo que não está listado, diga que pode passar para um atendente humano.",
    );
    parts.push(lines.join("\n"));
  } else if (!canShareContact) {
    prohibitions.push(
      "OBRIGATÓRIO: NÃO informe endereço, telefone ou site do negócio. Se o cliente perguntar onde fica, qual o telefone ou se há site, diga que pode passar o contato com um atendente humano.",
    );
  }

  // === INFORMAÇÕES GERAIS DO NEGÓCIO (Sim/Não) ===
  // Chave ausente do mapa = "não informado" — a IA nunca deve tratar isso
  // como "Não". Só entram aqui fatos que o tenant realmente preencheu.
  // Removido (opt-out) pelo tenant = apagado de business_general_info, então
  // já sai automaticamente daqui também.
  const generalInfo = (p as any).business_general_info as Record<string, boolean> | null;
  const giEntries = generalInfo
    ? Object.entries(generalInfo).filter(([, v]) => typeof v === "boolean")
    : [];
  const generalInfoNotes = (p as any).business_general_info_notes as Record<string, string> | null;
  const customFacts = (p as any).business_general_info_custom as
    | { id: string; label: string; value: boolean | null; note?: string }[]
    | null;
  const customFactEntries = Array.isArray(customFacts)
    ? customFacts.filter((f) => typeof f?.value === "boolean" && typeof f?.label === "string")
    : [];
  if (canShareContact && (giEntries.length > 0 || customFactEntries.length > 0)) {
    const lines: string[] = [
      "INFORMAÇÕES GERAIS DO NEGÓCIO (responda apenas se o cliente perguntar — não ofereça espontaneamente):",
    ];
    for (const [key, val] of giEntries) {
      const note = generalInfoNotes?.[key];
      lines.push(
        `- ${GENERAL_INFO_LABELS[key] ?? key}: ${val ? "Sim" : "Não"}${note ? ` (${note})` : ""}`,
      );
    }
    for (const f of customFactEntries) {
      lines.push(`- ${f.label}: ${f.value ? "Sim" : "Não"}${f.note ? ` (${f.note})` : ""}`);
    }
    lines.push(
      "Sobre qualquer outro fato do negócio que não esteja listado acima, diga que vai verificar com a equipe — não invente.",
    );
    parts.push(lines.join("\n"));
  }

  if (p.ai_tone) {
    const key = String(p.ai_tone).toLowerCase();
    const toneText = TONE_MAP[key];
    if (toneText) parts.push(toneText);
    else parts.push(`Seu tom de voz é: ${p.ai_tone}.`);
  }

  // === DESCRIÇÃO DO NEGÓCIO ===
  if (p.business_description) {
    parts.push(`Sobre o negócio: ${p.business_description}`);
  }

  // === PROFISSIONAIS (toggle de override) ===
  // A lista nominal vem em buildProfessionalsLayer (fonte de verdade: tabela professionals).
  // Aqui só registramos o override do usuário para forçar/suprimir a pergunta de preferência.
  const forceAskPreference = p.ai_has_multiple_professionals ?? false;
  const proCount = (p as any).__professionals_count ?? 0;
  if (proCount === 0) {
    prohibitions.push(
      `OBRIGATÓRIO: NÃO cite nomes próprios de profissionais. Trate o atendimento como genérico do estabelecimento.`,
    );
  } else if (proCount === 1) {
    parts.push(
      `Há apenas um profissional ativo. Assuma esse profissional implicitamente — NÃO pergunte preferência, NÃO pergunte "qual médico/profissional".`,
    );
  } else if (forceAskPreference) {
    parts.push(
      `Há mais de um profissional. Se o cliente NÃO mencionou nome e o assunto envolver agendamento, pergunte a preferência. Se o cliente JÁ citou um nome existente na lista, use direto sem perguntar.`,
    );
  } else {
    parts.push(
      `Há mais de um profissional. NÃO pergunte preferência de profissional — só responda sobre um profissional específico se o cliente perguntar por nome.`,
    );
  }

  // === POLÍTICA DE PREÇOS ===
  // Preço agora é configurável por serviço (services.price_disclosure_policy,
  // null = herda este padrão do workspace) — a regra efetiva de cada serviço
  // é aplicada dentro do catálogo em buildServicesLayer, não aqui. Isso
  // permite políticas diferentes por serviço na mesma conversa (ex.: consulta
  // sempre informa valor, cirurgia nunca).
  const pricePolicy: PriceDisclosurePolicy =
    (p.ai_price_disclosure_policy as PriceDisclosurePolicy) ?? "on_request";
  parts.push(
    `Sobre preços: siga a regra indicada junto de cada serviço no CATÁLOGO OFICIAL DE SERVIÇOS abaixo — cada serviço pode ter uma política diferente.`,
  );

  // === AGENDAMENTO (toggle principal) ===
  const scheduleEnabled = p.ai_schedule_enabled ?? false;
  if (scheduleEnabled) {
    if (p.ai_schedule_instruction) {
      parts.push(`Para agendamentos: ${p.ai_schedule_instruction}`);
    } else {
      parts.push(
        `Você pode auxiliar no agendamento. Confirme dia, horário e serviço com o cliente antes de marcar.`,
      );
    }
    const minHours = p.ai_min_advance_hours ?? 2;
    parts.push(
      `Antecedência mínima para agendamento: ${minHours} hora(s). Não aceite horários abaixo dessa antecedência.`,
    );
  } else {
    prohibitions.push(
      `OBRIGATÓRIO: VOCÊ NÃO PODE AGENDAR, MARCAR, RESERVAR, CONFIRMAR NEM PROPOR HORÁRIOS de atendimento. Se o cliente pedir agendamento, responda EXATAMENTE no espírito: "Vou encaminhar seu pedido para um atendente humano confirmar o horário com você." Não invente horários, não diga "reservei", "já marquei", "confirmado para amanhã", "agendamento confirmado" — nada disso. Mesmo que o cliente insista, NÃO confirme horário algum.`,
    );
  }

  // === REAGENDAR / CANCELAR ===
  const canReschedule = p.ai_can_reschedule ?? false;
  const canCancel = p.ai_can_cancel ?? false;
  if (canReschedule) {
    parts.push(`Você pode auxiliar a remarcar horários já agendados.`);
  } else {
    prohibitions.push(
      `OBRIGATÓRIO: VOCÊ NÃO PODE REMARCAR horários já agendados. Se o cliente pedir, responda que vai encaminhar para um atendente humano.`,
    );
  }
  if (canCancel) {
    parts.push(`Você pode auxiliar a cancelar agendamentos.`);
  } else {
    prohibitions.push(
      `OBRIGATÓRIO: VOCÊ NÃO PODE CANCELAR agendamentos. Se o cliente pedir, responda que vai encaminhar para um atendente humano.`,
    );
  }

  // === COLETA DE DADOS OBRIGATÓRIA ===
  // null = workspace nunca customizou -> herda do segmento. Array (mesmo
  // vazio) = override explícito do tenant, respeita como está (permite
  // "zero campos extras" sem cair de volta no padrão do segmento).
  const segmentFields: string[] = Array.isArray(p.segment_default_required_fields)
    ? (p.segment_default_required_fields as string[])
    : [];
  const requiredFields: string[] = p.ai_required_fields == null ? segmentFields : p.ai_required_fields;

  const customQuestions: string[] = Array.isArray(p.ai_custom_questions)
    ? (p.ai_custom_questions as string[]).filter((q) => typeof q === "string" && q.trim())
    : [];

  if (requiredFields.length > 0 || customQuestions.length > 0) {
    const items = [...requiredFields.map((f) => FIELD_LABELS[f] ?? f), ...customQuestions];
    parts.push(
      `Antes de qualquer ação (orçamento, agendamento, encaminhamento), faça as perguntas abaixo ao cliente se ele ainda não tiver informado:\n` +
        items.map((q) => `- ${q}`).join("\n"),
    );
  }

  // === INSTRUÇÕES ESPECÍFICAS DO WORKSPACE ===
  if (p.ai_custom_prompt) {
    parts.push(`Instruções específicas do estabelecimento: ${p.ai_custom_prompt}`);
  }

  // === MENSAGEM DE BOAS-VINDAS (referência de tom) ===
  if (p.welcome_message) {
    parts.push(`Tom de referência para boas-vindas: ${p.welcome_message}`);
  }

  // === PROIBIÇÕES (consolidadas) ===
  if (prohibitions.length > 0) {
    parts.push(
      `\n=== PROIBIÇÕES INVIOLÁVEIS DESTE WORKSPACE ===\n${prohibitions.map((r, i) => `${i + 1}. ${r}`).join("\n")}\nViolar qualquer uma dessas regras é falha grave. Nunca invente capacidade que não tem.`,
    );
  }

  // === REGRAS ABSOLUTAS DE COMPORTAMENTO ===
  const maxQ = p.ai_max_questions_per_message ?? 1;
  parts.push(
    `
REGRAS ABSOLUTAS — NUNCA VIOLE:
1. Responda SEMPRE em uma única mensagem. Nunca envie dois blocos separados.
2. Faça no máximo ${maxQ} pergunta por mensagem. Se precisar de mais informações, priorize a mais importante.
3. Não repita informações que já foram ditas nesta conversa.
4. Não use asteriscos (*) ou hashtags (#) para formatação. Use linguagem natural.
5. Seja direto e objetivo. Evite frases de efeito desnecessárias.
6. Nunca invente informações sobre serviços, preços ou disponibilidade não fornecidos.
7. NÃO ofereça encaminhar para um atendente humano de forma proativa, preventiva ou "por garantia". Só mencione transferir para humano quando: (a) o cliente pedir explicitamente falar com uma pessoa/atendente; (b) você realmente não souber a informação pedida ou ela não constar no contexto; ou (c) uma proibição inviolável deste workspace exigir essa resposta para o caso específico. Se você TEM a resposta no contexto, apenas responda — não acrescente "vou te encaminhar", "para que eu possa te encaminhar", "vou passar para um atendente" nem variações. Nunca use a transferência como ponte para fazer outra pergunta.
8. Nunca pressione o cliente. Não use táticas de urgência artificial.
9. Se uma proibição inviolável deste workspace conflita com o pedido do cliente, a proibição vence — sem exceções.
10. Se precisar de mais uma informação do cliente para continuar (ex.: especialidade, primeira consulta x retorno), pergunte direto e de forma natural — NÃO justifique a pergunta dizendo que vai encaminhar para um atendente.
`.trim(),
  );

  return parts.join("\n");
}

function formatPriceBRL(cents: number | null | undefined): string | null {
  if (cents == null || Number.isNaN(cents)) return null;
  const v = (cents / 100).toFixed(2).replace(".", ",");
  return `R$ ${v}`;
}

function buildServicesLayer(
  services: Array<{
    name: string;
    description: string | null;
    duration_minutes: number | null;
    price_cents: number | null;
    price_disclosure_policy?: PriceDisclosurePolicy | null;
  }>,
  workspaceDefaultPolicy: PriceDisclosurePolicy,
): string {
  if (!services || services.length === 0) {
    return [
      "=== CATÁLOGO OFICIAL DE SERVIÇOS ===",
      "O negócio ainda NÃO tem nenhum serviço cadastrado no sistema.",
      "",
      "REGRAS INVIOLÁVEIS:",
      "1. NÃO liste, descreva, sugira ou cite qualquer serviço — nem genérico, nem do ramo, nem do que 'normalmente' um negócio assim faz.",
      "2. NÃO use a descrição do negócio, o segmento, o nome do estabelecimento ou conhecimento geral do ramo para inferir serviços.",
      "3. Se — e SOMENTE se — o cliente perguntar QUAIS SERVIÇOS o negócio oferece, O QUE VOCÊS FAZEM, ou PREÇOS, responda no espírito de:",
      '   "No momento ainda não temos o catálogo de serviços cadastrado por aqui. Vou encaminhar você para um atendente humano que pode te passar todos os detalhes."',
      "4. ESTA regra NÃO se aplica a perguntas sobre profissionais, horários, endereço, telefone ou agendamento — para essas, use os blocos PROFISSIONAIS, AGENDA e DADOS DE CONTATO. A ausência de catálogo NÃO impede responder essas perguntas.",
      "5. Para agendamento sem serviço específico citado: confirme dia/hora/profissional normalmente; só mencione 'não temos catálogo' se o cliente perguntar QUAL serviço escolher.",
    ].join("\n");
  }

  const lines: string[] = [];
  lines.push("=== CATÁLOGO OFICIAL DE SERVIÇOS (FONTE ÚNICA DE VERDADE) ===");
  lines.push(
    "Estes são os ÚNICOS serviços que o negócio oferece. Não mencione, sugira nem invente nenhum outro, mesmo que pareçam óbvios para o ramo.",
  );
  lines.push("");

  for (const s of services) {
    const dur = s.duration_minutes && s.duration_minutes > 0 ? `${s.duration_minutes} min` : null;
    const header = dur ? `- ${s.name} (${dur})` : `- ${s.name}`;
    lines.push(header);
    const desc = (s.description ?? "").trim();
    if (desc) {
      lines.push(`  Descrição: ${desc}`);
    } else {
      lines.push(
        `  Descrição: (não informada — não invente detalhes deste serviço; se perguntarem, diga que vai pedir mais informações a um atendente)`,
      );
    }
    const effectivePolicy: PriceDisclosurePolicy = s.price_disclosure_policy ?? workspaceDefaultPolicy;
    const price = formatPriceBRL(s.price_cents);
    if (effectivePolicy === "always" && price) {
      lines.push(`  Valor: ${price}`);
    } else if (effectivePolicy === "on_request" && price) {
      lines.push(
        `  Valor: ${price} [só informe este valor se o cliente perguntar o preço de forma direta e literal — não cite espontaneamente]`,
      );
    } else if (effectivePolicy === "never") {
      lines.push(
        `  Valor: (não revelar — se perguntado, diga que os valores são passados por um atendente)`,
      );
    }
    lines.push("");
  }

  lines.push("REGRAS DE USO DESTE CATÁLOGO:");
  lines.push(
    "1. Ao apresentar os serviços, NÃO recite a lista crua. Use a Descrição de cada serviço para responder de forma natural e contextualizada ao que o cliente perguntou.",
  );
  lines.push(
    '2. Se a pergunta for genérica ("o que vocês fazem?"), faça um resumo curto cobrindo os serviços disponíveis com base nas descrições.',
  );
  lines.push(
    '3. Se a pergunta for específica ("vocês fazem X?"), responda APENAS com base na descrição do serviço correspondente.',
  );
  lines.push(
    "4. Se o cliente pedir um serviço que NÃO está nesta lista, diga que esse serviço não consta no catálogo e ofereça encaminhar para um atendente humano. Nunca prometa algo fora desta lista.",
  );
  lines.push(
    "5. NUNCA invente indicações, contraindicações, etapas, materiais ou procedimentos que não estejam na Descrição.",
  );
  lines.push(
    "6. NÃO use a descrição do negócio, o segmento ou o nome do estabelecimento para inferir serviços — eles servem apenas como contexto de tom de voz.",
  );
  lines.push(
    '7. Cada serviço tem sua própria regra de preço na linha "Valor:" acima. Onde disser "(não revelar)", isso é OBRIGATÓRIO e INVIOLÁVEL — nunca informe esse valor sob nenhuma circunstância, mesmo que o cliente insista; responda exatamente que os valores são passados por um atendente.',
  );

  return lines.join("\n");
}

// Bloco condicional: só existe (e só a IA fica sabendo que a capacidade
// existe) quando o toggle "IA pode enviar fotos" está ligado E algum serviço
// ativo tem pelo menos uma foto cadastrada. Se desligado, este bloco não é
// incluído no prompt — a IA nem sabe que fotos existem, maior garantia
// contra ela tentar "inventar" o envio.
function buildServicePhotosLayer(
  services: Array<{
    id: string;
    name: string;
    photos?: { id: string; url: string; caption: string }[] | null;
  }>,
  canSendPhotos: boolean,
): string {
  if (!canSendPhotos) return "";
  const withPhotos = services.filter((s) => Array.isArray(s.photos) && s.photos.length > 0);
  if (withPhotos.length === 0) return "";

  const lines: string[] = [];
  lines.push("=== FOTOS DE SERVIÇOS DISPONÍVEIS ===");
  lines.push(
    'Você pode enviar UMA foto de exemplo/resultado de um serviço, mas SOMENTE quando o cliente pedir explicitamente para ver (ex.: "tem foto?", "manda uma foto", "como fica o antes e depois?"). NUNCA envie proativamente ou sem pedido explícito. NUNCA mais de uma foto por mensagem sua.',
  );
  lines.push("");
  for (const s of withPhotos) {
    lines.push(`- Serviço "${s.name}" (service_id: "${s.id}"):`);
    for (const photo of s.photos ?? []) {
      lines.push(`  - photo_id "${photo.id}"${photo.caption ? `: ${photo.caption}` : ""}`);
    }
  }
  lines.push("");
  lines.push(
    "Para enviar, termine sua resposta — sem nenhum outro texto depois — com uma linha exatamente assim:",
  );
  lines.push('PHOTO_JSON:{"service_id":"<service_id acima>","photo_id":"<photo_id acima>"}');
  lines.push(
    "Se o cliente pedir foto de um serviço que NÃO está listado acima (ou o serviço não tem fotos), diga que no momento não tem foto disponível para esse serviço — nunca invente um photo_id ou service_id.",
  );
  return lines.join("\n");
}

type ProRow = {
  id: string;
  name: string;
  role: string | null;
  /** Jornada própria. NULL = segue o horário do negócio. */
  working_hours?: RawHours;
};
type ApptRow = { professional_id: string | null; starts_at: string; ends_at: string };

function buildNowLayer(tz: string): string {
  const now = new Date();
  const fmtFull = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const fmtTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const fmtIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtWeekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
  });
  const todayIso = fmtIso.format(now); // YYYY-MM-DD
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  const afterTomorrow = new Date(now.getTime() + 48 * 3600_000);
  return [
    "=== DATA E HORA ATUAIS (FONTE ÚNICA DE VERDADE) ===",
    `Agora: ${fmtFull.format(now)} — ${fmtTime.format(now)} (fuso ${tz}).`,
    `HOJE = ${todayIso} (${fmtWeekday.format(now)}).`,
    `AMANHÃ = ${fmtIso.format(tomorrow)} (${fmtWeekday.format(tomorrow)}).`,
    `DEPOIS DE AMANHÃ = ${fmtIso.format(afterTomorrow)} (${fmtWeekday.format(afterTomorrow)}).`,
    "",
    "REGRAS DE TEMPO (use SEMPRE estas referências, NUNCA chute datas):",
    "1. Quando o cliente disser 'hoje', use a data HOJE acima. 'Amanhã' = AMANHÃ. 'Depois de amanhã' = DEPOIS DE AMANHÃ.",
    "2. Se o cliente disser apenas um horário sem data ('às 15h', 'umas 10'), assuma HOJE se o horário ainda não passou; caso já tenha passado, confirme com ele se quer amanhã.",
    "3. Nunca diga 'amanhã é dia X' sem usar a data exata listada acima. Se houver dúvida, leia novamente este bloco.",
    "",
    "PERÍODOS DO DIA (interpretação obrigatória):",
    "- Manhã = 06:00 às 11:59.",
    "- Meio-dia / horário de almoço = 12:00 às 13:59.",
    "- 'Depois do almoço' = a partir das 12:00 (geralmente 13:00–14:00 em diante) do MESMO dia mencionado.",
    "- Tarde = 12:00 às 17:59.",
    "- Final de tarde = 17:00 às 18:59.",
    "- Noite = 18:00 às 22:59.",
    "Se o cliente disser 'tarde' ou 'depois do almoço' sem horário exato, ofereça 2–3 opções dentro dessa faixa que estejam livres na agenda dos profissionais.",
  ].join("\n");
}

function buildProfessionalsLayer(
  pros: ProRow[],
  upcoming: ApptRow[],
  businessHours: WorkingHours | null,
  tz: string,
): string | null {
  if (!pros || pros.length === 0) return null;

  const fmtDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const fmtTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const byPro = new Map<string, ApptRow[]>();
  for (const a of upcoming) {
    if (!a.professional_id) continue;
    const list = byPro.get(a.professional_id) ?? [];
    list.push(a);
    byPro.set(a.professional_id, list);
  }

  const lines: string[] = [];
  lines.push("=== PROFISSIONAIS ATIVOS (FONTE ÚNICA DE VERDADE) ===");
  lines.push(
    "Estes são os ÚNICOS profissionais que atendem neste negócio. Use exatamente estes nomes. Não invente nem cite outros nomes.",
  );
  lines.push("");

  // Resumo do horário de funcionamento (todos os profissionais seguem o mesmo).
  if (businessHours && typeof businessHours === "object") {
    const dayLabels: Record<string, string> = {
      monday: "Seg",
      mon: "Seg",
      tuesday: "Ter",
      tue: "Ter",
      wednesday: "Qua",
      wed: "Qua",
      thursday: "Qui",
      thu: "Qui",
      friday: "Sex",
      fri: "Sex",
      saturday: "Sáb",
      sat: "Sáb",
      sunday: "Dom",
      sun: "Dom",
    };
    const openDays: string[] = [];
    for (const [k, v] of Object.entries(businessHours as Record<string, DayCfg>)) {
      const enabled = v?.enabled ?? v?.active ?? false;
      if (enabled && v?.start && v?.end) {
        const lbl = dayLabels[k.toLowerCase()] ?? k;
        openDays.push(`${lbl} ${v.start}–${v.end}`);
      }
    }
    if (openDays.length > 0) {
      lines.push(`Horário de funcionamento do negócio: ${openDays.join(", ")} (fuso ${tz}).`);
      lines.push("");
    }
  }

  for (const p of pros) {
    const roleStr = p.role && p.role.trim() ? ` (${p.role.trim()})` : "";
    lines.push(`- ${p.name}${roleStr} [id:${p.id}]`);
    // Jornada própria só é citada quando existe — quem herda o horário do
    // negócio já está coberto pela linha global acima (não incha o prompt).
    const ownHours = describeHours(normalizeHours(p.working_hours));
    if (ownHours) {
      lines.push(`  Jornada própria (difere do negócio): ${ownHours}`);
    }
    const appts = (byPro.get(p.id) ?? []).slice(0, 12);
    if (appts.length === 0) {
      lines.push(`  Próximos 7 dias: sem compromissos cadastrados.`);
    } else {
      lines.push(`  Compromissos já marcados (próximos 7 dias):`);
      for (const a of appts) {
        const d = new Date(a.starts_at);
        const e = new Date(a.ends_at);
        lines.push(`    • ${fmtDate.format(d)} ${fmtTime.format(d)}–${fmtTime.format(e)}`);
      }
    }
  }

  lines.push("");
  lines.push("REGRAS DE USO DESTE BLOCO:");
  lines.push(
    "1. Se o cliente perguntar 'qual médico/profissional vocês têm', responda com a lista acima.",
  );
  lines.push(
    "2. Se o cliente citar um nome que ESTÁ na lista, responda direto sobre esse profissional. Use os compromissos acima para indicar janelas livres/ocupadas dentro do horário de funcionamento.",
  );
  lines.push(
    "3. Se o cliente citar um nome que NÃO está na lista, diga educadamente que esse profissional não atende aqui e cite os disponíveis.",
  );
  lines.push(
    "4. Para confirmar horário definitivo, ofereça o link público de agendamento (se houver) — não invente disponibilidade exata, apenas oriente.",
  );
  lines.push(
    "5. NUNCA responda 'não temos catálogo' para perguntas sobre profissionais ou horários — essa resposta é APENAS para perguntas de serviços/preços quando o catálogo está vazio.",
  );
  lines.push(
    "6. O `[id:...]` ao lado de cada nome é só para você usar no campo professional_id do JSON de agendamento — nunca mostre esse id para o cliente.",
  );
  lines.push(
    "7. JORNADA: cada profissional só pode ser agendado DENTRO da jornada dele. Quem tem 'Jornada própria' listada acima segue APENAS aquela jornada (ignore o horário geral do negócio para essa pessoa); quem não tem, segue o horário do negócio. O atendimento inteiro precisa caber na jornada — não ofereça um horário cujo término ultrapasse o fim do expediente, nem horários que caiam em intervalo (ex.: almoço) ou em dia de folga. Se o cliente pedir um horário fora da jornada, diga que a pessoa não atende nesse horário e ofereça alternativas válidas.",
  );

  return lines.join("\n");
}

function estimateCostCents(input: number, output: number) {
  const cents = (input / 1_000_000) * 25 + (output / 1_000_000) * 150;
  return Math.max(1, Math.round(cents));
}

type ContactApptRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string | null;
  professional_name: string | null;
  client_name: string | null;
};

function buildContactAppointmentsLayer(rows: ContactApptRow[], tz: string): string | null {
  if (!rows || rows.length === 0) {
    return [
      "=== AGENDAMENTOS DESTE CLIENTE ===",
      "Este cliente NÃO possui nenhum agendamento ativo nem recente nos registros.",
      "Se ele perguntar 'quando eu tenho consulta marcada?', 'meu horário', 'minha próxima consulta', responda EXATAMENTE com base nesta informação — diga que não há agendamento ativo no sistema e pergunte se ele quer marcar um novo. Não invente datas.",
    ].join("\n");
  }
  const fmtDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const fmtTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const lines: string[] = [];
  lines.push("=== AGENDAMENTOS DESTE CLIENTE (FONTE ÚNICA DE VERDADE) ===");
  lines.push(
    "Use APENAS esta lista para responder qualquer pergunta sobre 'minha consulta', 'meu horário', 'quando eu tenho marcado', 'consulta agendada'. Nunca diga que não tem acesso à agenda — você TEM.",
  );
  lines.push("");
  for (const r of rows) {
    const d = new Date(r.starts_at);
    const status =
      r.status === "cancelled" ? " (CANCELADO)" : r.status === "completed" ? " (CONCLUÍDO)" : "";
    const svc = r.service_name ?? "atendimento";
    const pro = r.professional_name ? ` com ${r.professional_name}` : "";
    const titular = r.client_name ? ` (para ${r.client_name})` : "";
    lines.push(
      `- [id:${r.id}] ${fmtDate.format(d)} às ${fmtTime.format(d)} — ${svc}${pro}${titular}${status}`,
    );
  }
  lines.push("");
  lines.push("REGRAS:");
  lines.push(
    "1. Ao informar a consulta ao cliente, escreva data e hora em linguagem natural — NUNCA mostre o [id:...] pra ele.",
  );
  lines.push(
    "2. Os IDs entre colchetes são usados APENAS por você nos blocos RESCHEDULE_JSON / CANCEL_JSON.",
  );
  lines.push(
    "3. Agendamentos marcados (CANCELADO) ou (CONCLUÍDO) NÃO podem ser reagendados nem cancelados de novo — informe o cliente caso ele tente.",
  );
  lines.push(
    "4. Quando houver 2+ agendamentos ativos do mesmo contato (ex.: um pro cliente e um pra um familiar), use o nome entre parênteses '(para ...)', além de dia/hora, para descobrir qual o cliente quer mudar/cancelar — pergunte 'é o seu ou o de {nome}?' se não tiver certeza.",
  );
  return lines.join("\n");
}

export async function runAiResponse(input: AiRunInput): Promise<AiRunResult> {
  const data = {
    conversation_history: [],
    preview: false,
    ...input,
  };

  // ── LOCK SOFT: deduplica chamadas para a MESMA mensagem do WhatsApp ──
  // Quando o Evolution reentrega o webhook (mesmo m.key.id), usamos esse id
  // como chave estável. Sem id (ex.: testador de prévia), caímos num bucket
  // de 10s + hash do conteúdo.
  let dedupKey: string | null = null;
  if (!data.preview) {
    if (data.wa_message_id) {
      dedupKey = `wa:${data.workspace_owner_id}:${data.wa_message_id}`;
    } else {
      const bucket = Math.floor(Date.now() / 10000);
      const msgPart = (data.message ?? "").slice(0, 200);
      dedupKey = `${data.workspace_owner_id}|${data.contact_id ?? ""}|${bucket}|${msgPart}`;
    }
    const { data: existing } = await supabaseAdmin
      .from("ai_usage_logs")
      .select("id")
      .eq("dedup_key", dedupKey)
      .maybeSingle();
    if (existing) {
      return { action: "skip", reason: "duplicate" };
    }
  }

  const { data: globalRows } = await supabaseAdmin
    .from("global_settings")
    .select("key,value")
    .in("key", [
      "gemini_api_key",
      "gemini_model",
      "gemini_temperature",
      "gemini_max_tokens",
      "ai_base_prompt",
    ]);
  const g = Object.fromEntries((globalRows ?? []).map((r) => [r.key, r.value ?? ""]));
  if (!g.gemini_api_key) {
    return { action: "skip", reason: "Gemini não configurado" };
  }

  // Carrega profile + segmento (join) numa única query.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "*, ai_segments:segment_id ( id, segment_prompt, default_transfer_keywords, default_required_fields )",
    )
    .eq("id", data.workspace_owner_id)
    .maybeSingle();
  if (!profile) return { action: "skip", reason: "Workspace não encontrado" };
  if (!profile.ai_enabled) return { action: "skip", reason: "IA desativada" };

  const segment = (profile as any).ai_segments as {
    id: string;
    segment_prompt: string | null;
    default_transfer_keywords: string[] | null;
    default_required_fields: string[] | null;
  } | null;

  // ===== CATÁLOGO DE SERVIÇOS (fonte única de verdade) =====
  // Carrega os serviços ativos do workspace.
  // A IA NUNCA deve inferir serviços a partir de business_description,
  // segmento ou nome — só pode falar do que está aqui.
  const { data: activeServices } = await supabaseAdmin
    .from("services")
    .select("id,name,description,duration_minutes,price_cents,price_disclosure_policy,photos")
    .eq("owner_user_id", data.workspace_owner_id)
    .eq("status", "active")
    .order("name", { ascending: true });

  const pricePolicyForCatalog: PriceDisclosurePolicy =
    ((profile as any).ai_price_disclosure_policy as PriceDisclosurePolicy) ?? "on_request";

  const servicesLayer = buildServicesLayer(activeServices ?? [], pricePolicyForCatalog);
  const canSendPhotos = (profile as any).ai_can_send_photos === true;
  const servicePhotosLayer = buildServicePhotosLayer(activeServices ?? [], canSendPhotos);

  // ===== PROFISSIONAIS + AGENDA (próximos 7 dias) =====
  const { data: prosRows } = await supabaseAdmin
    .from("professionals")
    .select("id,name,role,working_hours")
    .eq("owner_user_id", data.workspace_owner_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const pros: ProRow[] = (prosRows ?? []) as ProRow[];

  const nowIso = new Date().toISOString();
  const sevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let upcoming: ApptRow[] = [];
  if (pros.length > 0) {
    const { data: apptsRows } = await supabaseAdmin
      .from("appointments")
      .select("professional_id,starts_at,ends_at,status")
      .eq("owner_user_id", data.workspace_owner_id)
      .gte("starts_at", nowIso)
      .lte("starts_at", sevenDaysIso)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true });
    upcoming = ((apptsRows ?? []) as any[]).map((r) => ({
      professional_id: r.professional_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
    }));
  }

  // Sempre validar timezone — se inválido, força Brasília (nunca cai no fuso do servidor).
  const rawTz =
    (profile.ai_timezone as string | null) ||
    (profile.business_timezone as string | null) ||
    "America/Sao_Paulo";
  let tz = "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: rawTz });
    tz = rawTz;
  } catch {
    console.log("[ai hours] timezone inválido, usando America/Sao_Paulo", { rawTz });
  }
  const aiHours = profile.ai_working_hours as WorkingHours | null;
  const bizHours = profile.business_hours as WorkingHours | null;
  // "Horário de Funcionamento" (tela Negócio) é informativo — já é citado
  // pra IA em buildProfessionalsLayer. Só "Horário de Atendimento da IA"
  // (tela IA) decide quando ela responde de verdade. Se a tela IA nunca foi
  // configurada, caímos pro horário do negócio (compat com workspaces
  // antigos que só preencheram a tela Negócio e nunca tocaram na tela IA).
  const aiHoursConfigured =
    !!aiHours && typeof aiHours === "object" && Object.keys(aiHours).length > 0;
  const bizHoursConfigured =
    !!bizHours && typeof bizHours === "object" && Object.keys(bizHours).length > 0;
  const gatingSource = aiHoursConfigured
    ? "ai_working_hours"
    : bizHoursConfigured
      ? "business_hours"
      : "none";
  const gatingHours = aiHoursConfigured ? aiHours : bizHoursConfigured ? bizHours : null;
  console.log("[ai hours] check", { tz, gatingSource });
  const withinAny = isWithinHours(gatingHours, tz);
  if (!withinAny) {
    // SEGURANCA: a mensagem fora do horario so e enviada quando o usuario
    // optou EXPLICITAMENTE por ativar. Se nao houver coluna nem marcador
    // no JSON, assumimos FALSE para evitar spam quando o workspace nao
    // configurou nada (caso comum em ambientes antigos).
    const columnValue =
      typeof profile.ai_out_of_hours_enabled === "boolean" ? profile.ai_out_of_hours_enabled : null;
    const jsonFallback =
      typeof aiHours?.__out_of_hours?.enabled === "boolean" ? aiHours.__out_of_hours.enabled : null;
    const outEnabled = columnValue ?? jsonFallback ?? false;
    console.log("[ai hours] decision", {
      tz,
      gatingSource,
      column_value: columnValue,
      json_fallback: jsonFallback,
      ai_out_of_hours_enabled: outEnabled,
      action: outEnabled ? "send_out_of_hours" : "skip_out_of_hours_disabled",
    });
    if (!outEnabled) {
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "skip_out_of_hours_disabled",
          dedup_key: dedupKey,
        });
      }
      return { action: "skip", reason: "out_of_hours_disabled" };
    }
    const rawOut =
      typeof profile.ai_out_of_hours_message === "string" && profile.ai_out_of_hours_message.trim()
        ? profile.ai_out_of_hours_message
        : MESSAGE_DEFAULTS.out_of_hours.default;
    const out = renderTemplate(rawOut, {
      negocio: (profile as any).business_name ?? "nosso estabelecimento",
    });
    if (!data.preview) {
      await supabaseAdmin.from("ai_usage_logs").insert({
        workspace_owner_id: data.workspace_owner_id,
        segment_id: segment?.id ?? null,
        contact_id: data.contact_id ?? null,
        action: "send_out_of_hours",
        dedup_key: dedupKey,
      });
    }
    return { action: "send_out_of_hours", response: out };
  }

  const allKws = [
    ...(segment?.default_transfer_keywords ?? []),
    ...((profile.ai_transfer_keywords as string[] | null) ?? []),
  ].map((s) => s.toLowerCase());
  const lower = data.message.toLowerCase();
  if (allKws.some((kw) => kw && lower.includes(kw))) {
    const transferEnabled =
      typeof (profile as any).msg_transfer_enabled === "boolean"
        ? (profile as any).msg_transfer_enabled
        : true;
    if (!transferEnabled) {
      // Apenas marca a transferência interna, sem mensagem ao cliente.
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "transfer_to_human",
          dedup_key: dedupKey,
        });
      }
      return { action: "skip", reason: "transfer_message_disabled" };
    }
    if (!data.preview) {
      await supabaseAdmin.from("ai_usage_logs").insert({
        workspace_owner_id: data.workspace_owner_id,
        segment_id: segment?.id ?? null,
        contact_id: data.contact_id ?? null,
        action: "transfer_to_human",
        dedup_key: dedupKey,
      });
    }
    const rawTransfer =
      typeof (profile as any).msg_transfer_text === "string" &&
      (profile as any).msg_transfer_text.trim()
        ? (profile as any).msg_transfer_text
        : MESSAGE_DEFAULTS.transfer.default;
    const transferMsg = renderTemplate(rawTransfer, {
      cliente: (data as any).contact_name ?? "",
    });
    return {
      action: "transfer_to_human",
      response: transferMsg,
    };
  }

  const isFirstMessage = (data.conversation_history ?? []).length === 0;

  // ===== AGENDAMENTOS DO PRÓPRIO CONTATO (para reagendar/cancelar/consultar) =====
  let contactAppts: ContactApptRow[] = [];
  if (data.contact_id) {
    const lowerWindow = new Date(Date.now() - 24 * 3600_000).toISOString();
    const upperWindow = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("appointments")
      .select("id,starts_at,ends_at,status,client_name,services(name),professionals(name)")
      .eq("owner_user_id", data.workspace_owner_id)
      .eq("contact_id", data.contact_id)
      .gte("starts_at", lowerWindow)
      .lte("starts_at", upperWindow)
      .order("starts_at", { ascending: true })
      .limit(20);
    contactAppts = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      status: r.status,
      service_name: r.services?.name ?? null,
      professional_name: r.professionals?.name ?? null,
      client_name: r.client_name ?? null,
    }));
  }
  const contactApptsLayer = data.contact_id
    ? buildContactAppointmentsLayer(contactAppts, tz)
    : null;

  // Dados já conhecidos do cliente (vindos do WhatsApp). A IA NUNCA deve
  // pedir telefone — o número da conversa JÁ é o WhatsApp dele.
  const knownName = (data.contact_name ?? "").trim();
  const knownPhone = (data.contact_phone ?? "").trim();
  const knownClientLayer =
    knownName || knownPhone
      ? [
          "=== DADOS JÁ CONHECIDOS DESTE CLIENTE (FONTE ÚNICA DE VERDADE) ===",
          knownName ? `Nome no WhatsApp: ${knownName}` : null,
          knownPhone ? `Telefone (WhatsApp): ${knownPhone}` : null,
          "",
          "REGRAS ABSOLUTAS:",
          "1. NUNCA peça o número de telefone — você JÁ tem (é o WhatsApp acima). Use esse telefone em qualquer agendamento.",
          "2. NUNCA peça 'um número de contato', 'telefone para finalizar', 'número para confirmação' nem nada parecido. O cliente vai estranhar.",
          "3. Use o Nome do WhatsApp como nome do cliente, a menos que ele já tenha dado um nome diferente nesta conversa ou em mensagens anteriores. Só pergunte o nome completo se o Nome do WhatsApp for claramente vazio, um apelido genérico ('Cliente', 'Z', 'A'), ou só um primeiro nome curto e você precisar do sobrenome para o registro.",
        ]
          .filter(Boolean)
          .join("\n")
      : null;

  // Agendamento autônomo pela IA — SEMPRE habilitado (link público foi removido).
  // A IA é dona da agenda: agendar, reagendar (substitui o horário) e cancelar.
  const canReschedule = true;
  const canCancel = true;
  const bookingLayer = [
    "=== AGENDA — VOCÊ É A DONA DA AGENDA ===",
    "Você executa DIRETAMENTE na agenda do negócio: criar, reagendar (substitui o horário antigo pelo novo) e cancelar (libera o horário). Não existe link externo, não existe atendente humano que vai 'finalizar' por você. NÃO ofereça transferir para humano em assunto de agendamento — você resolve.",
    "",
    "═══ PROTOCOLO DE 2 ETAPAS (INVIOLÁVEL) ═══",
    "Toda ação na agenda (criar / reagendar / cancelar) é feita em DUAS mensagens separadas:",
    "  ETAPA 1 (esta mensagem é APENAS texto, SEM nenhum bloco JSON):",
    '    - Resuma a ação proposta: "Confirmo então: {serviço} com {profissional} em {data} às {hora}, no nome de {nome}. Posso confirmar?"',
    '    - Para reagendar: "Confirma que quer mudar sua consulta de {data antiga} {hora antiga} para {data nova} {hora nova}?"',
    '    - Para cancelar: "Confirma o cancelamento da sua consulta de {data} às {hora}?"',
    "    - Termine SEMPRE com a pergunta de confirmação. NUNCA inclua APPOINTMENT_JSON / RESCHEDULE_JSON / CANCEL_JSON nesta mensagem.",
    '  ETAPA 2 (só ocorre na PRÓXIMA mensagem, depois que o cliente responder confirmando — "sim", "pode", "isso", "confirmo", "ok", "pode confirmar", "pode marcar", "pode cancelar"):',
    '    - Responda em UMA frase curta confirmando a execução ("Pronto, agendado!" / "Reagendado!" / "Cancelado!").',
    "    - No FINAL da resposta, em UMA única linha sem markdown, emita o bloco JSON correspondente.",
    "Violar esse protocolo (emitir JSON junto com a pergunta de confirmação) é falha grave. Se você não tem certeza de que a última mensagem do cliente foi uma confirmação explícita do que VOCÊ propôs, NÃO emita JSON — volte para a ETAPA 1 e pergunte de novo.",
    "",
    "═══ DESAMBIGUAÇÃO DE INTENÇÃO ═══",
    '- Se o cliente disser "desmarcar", "cancelar", "não posso mais", "não vou mais" → intenção é CANCELAR. NUNCA emita APPOINTMENT_JSON nesse contexto.',
    '- Se o cliente disser "remarcar", "mudar", "trocar o horário", "adiantar", "adiar", "passar para outro dia" → intenção é REAGENDAR. NUNCA emita APPOINTMENT_JSON — use RESCHEDULE_JSON depois de confirmar a nova data.',
    "- Só use APPOINTMENT_JSON para AGENDAMENTOS NOVOS (cliente ainda não tem o horário desejado na lista AGENDAMENTOS DESTE CLIENTE).",
    '- Se o cliente já tem um agendamento ativo e está pedindo OUTRO em data diferente, pergunte: "Quer manter o de {data antiga} e marcar outro, ou trocar o horário?" — não assuma.',
    "",
    "═══ COMO CRIAR (APPOINTMENT_JSON) ═══",
    "Pré-requisitos antes da ETAPA 1: SERVIÇO (da lista oficial), DATA+HORA livre na agenda do profissional, PROFISSIONAL (se houver mais de um), e o NOME REAL de cada pessoa que será atendida. NÃO peça telefone — use o do WhatsApp.",
    "REGRA CRÍTICA (o sistema REJEITA o agendamento se violada): client_name tem que ser o nome próprio da pessoa. Parentesco NÃO é nome — \"Mãe do Bruno\", \"minha esposa\", \"filha da Ana\", \"meu filho\" são todos REJEITADOS. Se o cliente só falou o parentesco, PERGUNTE (\"Qual o nome da sua mãe?\") ANTES de propor horário na ETAPA 1.",
    'Formato para 1 agendamento (linha única, sem markdown, no FINAL da ETAPA 2): APPOINTMENT_JSON:{"service_name":"...","starts_at":"YYYY-MM-DDTHH:mm:00-03:00","client_name":"...","client_phone":"...","professional_id":"..."}',
    "Formato para MÚLTIPLOS agendamentos no mesmo turno (ex.: cliente pede um pra ele e um pra um familiar): use o MESMO marcador uma única vez, seguido de um array — APPOINTMENT_JSON:[{...},{...}]. Cada item leva seu próprio client_name (nome de quem vai ser atendido nesse item, pode ser diferente do nome de quem está no WhatsApp).",
    "- Se o cliente pedir agendamento para outra pessoa (familiar, amigo etc.) e ainda não disse o nome real dela, PERGUNTE o nome antes de avançar para a ETAPA 1 — client_name nunca pode ser um apelido genérico como 'mãe dele', 'esposa', 'minha filha'. NÃO peça telefone da outra pessoa — o telefone do agendamento continua sendo sempre o do WhatsApp da conversa atual, independente de para quem é o atendimento.",
    '- Se o cliente pedir o MESMO horário nominal para 2+ serviços com o mesmo profissional (ex.: "os dois às 9h"), repita o mesmo starts_at em cada item do array — o sistema ajusta automaticamente o horário dos itens seguintes pra não sobrepor (soma a duração do serviço anterior). Não calcule você mesma o horário ajustado, não invente "9h e 9h30" no seu texto — só repita o horário pedido em cada item e deixe o sistema encadear.',
    "- Se o cliente já der horários distintos para cada agendamento, use cada starts_at exatamente como pedido, sem ajuste.",
    "- professional_id: uuid EXATO copiado do `[id:...]` da lista PROFISSIONAIS ATIVOS. OBRIGATÓRIO sempre que houver 2+ profissionais ativos, em TODOS os itens (inclusive em lote). Se não tiver certeza de qual profissional o cliente quer para qualquer um dos agendamentos, NÃO emita o JSON — volte pra ETAPA 1 e pergunte antes.",
    "",
    "═══ COMO REAGENDAR (RESCHEDULE_JSON) — substitui o horário antigo pelo novo ═══",
    "Use o [id:...] do agendamento na lista AGENDAMENTOS DESTE CLIENTE. O sistema MOVE o horário (o slot antigo é liberado automaticamente, o novo é ocupado).",
    "REGRA CRÍTICA: use APENAS [id:...] de agendamento que NÃO esteja marcado como (CANCELADO) ou (CONCLUÍDO). Se houver mais de um ativo, PERGUNTE ao cliente qual antes de emitir o JSON.",
    "REGRA CRÍTICA: `new_starts_at` DEVE terminar com o offset `-03:00`. Exemplo válido: `2026-05-23T14:00:00-03:00`. Sem isso o sistema rejeita.",
    'Formato exato (ETAPA 2 apenas): RESCHEDULE_JSON:{"appointment_id":"<uuid-do-id-da-lista>","new_starts_at":"YYYY-MM-DDTHH:mm:00-03:00"}',
    'Para remarcar VÁRIOS agendamentos no mesmo turno (ex.: o do cliente e o de um familiar), use UM único marcador com um array: RESCHEDULE_JSON:[{...},{...}]',
    "",
    "═══ COMO CANCELAR (CANCEL_JSON) — libera o horário na agenda ═══",
    "Use o [id:...] do agendamento na lista AGENDAMENTOS DESTE CLIENTE. O sistema marca como cancelado e LIBERA o slot na agenda. Nunca use id de agendamento já (CANCELADO).",
    'Formato exato (ETAPA 2 apenas): CANCEL_JSON:{"appointment_id":"<uuid-do-id-da-lista>","reason":"motivo curto do cliente"}',
    "Para cancelar VÁRIOS de uma vez, use UM único marcador com um array: CANCEL_JSON:[{...},{...}]",
    "",
    "═══ REGRAS FINAIS ═══",
    "1. NO MÁXIMO UM marcador APPOINTMENT_JSON: por resposta — se houver mais de um agendamento no mesmo turno, coloque todos dentro de UM único array nesse marcador (nunca repita o marcador).",
    "2. NUNCA mostre o uuid [id:...] para o cliente — é só para você.",
    '3. Depois que você emitir o JSON, na PRÓXIMA mensagem o bloco AGENDAMENTOS DESTE CLIENTE acima já estará atualizado — use-o como fonte da verdade. Nunca diga "não tenho acesso à agenda".',
    '4. Se o cliente perguntar sobre uma consulta marcada ("quando é minha consulta?"), responda com a data/hora EXATA da lista AGENDAMENTOS DESTE CLIENTE — sem repetir confirmação, sem emitir JSON.',
  ].join("\n");

  const professionalsLayer = buildProfessionalsLayer(pros, upcoming, bizHours, tz);

  const summarySection =
    data.ai_summary && data.ai_summary.trim()
      ? `=== HISTÓRICO ANTERIOR DO CLIENTE (resumo automático) ===\n${data.ai_summary.trim()}\n=== FIM DO HISTÓRICO ANTERIOR ===`
      : "";

  const finalPrompt = [
    summarySection,
    buildNowLayer(tz),
    g.ai_base_prompt,
    segment?.segment_prompt ?? "",
    buildWorkspaceLayer({
      ...profile,
      segment_default_required_fields: segment?.default_required_fields ?? [],
      __is_first_message: isFirstMessage,
      __professionals_count: pros.length,
    }),
    professionalsLayer,
    knownClientLayer,
    contactApptsLayer,
    servicesLayer,
    servicePhotosLayer,
    bookingLayer,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const model = g.gemini_model || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${g.gemini_api_key}`;
  const lastUserParts: Array<Record<string, unknown>> = [];
  if (data.audio?.data && data.audio?.mimeType) {
    lastUserParts.push({
      inlineData: { mimeType: data.audio.mimeType, data: data.audio.data },
    });
    lastUserParts.push({
      text: data.message?.trim() || "Ouça o áudio do cliente acima e responda em português.",
    });
  } else {
    lastUserParts.push({ text: data.message });
  }
  const contents = [
    ...(data.conversation_history ?? []).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: lastUserParts },
  ];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: finalPrompt }] },
        generationConfig: {
          temperature: parseFloat(g.gemini_temperature || "0.7"),
          maxOutputTokens: parseInt(g.gemini_max_tokens || "1000", 10),
          topP: 0.95,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "error",
          error_message: JSON.stringify(json).slice(0, 500),
          dedup_key: dedupKey,
        });
      }
      return { action: "error", error: `HTTP ${res.status}` };
    }
    let text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Trava anti-prematuro: se a IA ainda está pedindo confirmação NO MESMO
    // texto onde emitiu o JSON, descarta a execução (viola o protocolo de 2 etapas).
    const textWithoutJson = text
      .replace(/APPOINTMENT_JSON:\{[\s\S]*?\}\s*$/, "")
      .replace(/RESCHEDULE_JSON:\{[\s\S]*?\}\s*$/, "")
      .replace(/CANCEL_JSON:\{[\s\S]*?\}\s*$/, "")
      .trim();
    const asksForConfirmation =
      /(posso\s+confirmar|confirma\s*\?|posso\s+marcar\??|posso\s+agendar\??|posso\s+cancelar\??|posso\s+remarcar\??|tudo\s+certo\??|fica\s+bom\??|fechado\??)/i.test(
        textWithoutJson,
      );

    // Intenção do cliente nesta mensagem: bloqueia APPOINTMENT_JSON se ele
    // acabou de pedir cancelamento/remarcação.
    const userMsgLower = (data.message ?? "").toLowerCase();
    const userWantsCancel =
      /\b(desmarc|cancel|n[aã]o\s+(vou|posso)\s+mais|n[aã]o\s+poderei|n[aã]o\s+vai\s+dar)/i.test(
        userMsgLower,
      );
    const userWantsReschedule =
      /\b(remarc|mudar\s+(o\s+)?hor[aá]rio|trocar\s+(o\s+)?hor[aá]rio|adiantar|adiar|passar\s+para|outro\s+dia|outro\s+hor[aá]rio)/i.test(
        userMsgLower,
      );

    // Helper: traduz reason de falha em mensagem honesta pro cliente.
    const friendlyReason = (
      action: "create" | "reschedule" | "cancel",
      reason?: string,
      ctx?: { professional_name?: string | null; working_hours_hint?: string },
    ): string => {
      // Aceita reasons prefixadas pelo reschedule (ex.: "create:slot_taken", "cancel:appointment_not_found").
      const bare = reason?.includes(":") ? reason.split(":").slice(1).join(":") : reason;
      switch (bare) {
        case "outside_working_hours": {
          const quem = ctx?.professional_name ? `${ctx.professional_name} não atende` : "Não atendemos";
          const quando = ctx?.working_hours_hint ? ` Os horários são: ${ctx.working_hours_hint}.` : "";
          return `${quem} nesse horário.${quando} Qual outro horário fica bom pra você?`;
        }
        case "slot_taken":
          return "Esse horário acabou de ser ocupado. Pode me dizer outro horário?";
        case "past_date":
          return "Esse horário já passou. Qual outro fica bom pra você?";
        case "bad_date":
          return "Tive um problema técnico aqui — pode repetir a data e a hora desejadas?";
        case "ambiguous_appointment":
          return "Você tem mais de um agendamento ativo. Me diga o dia e a hora do que você quer mudar.";
        case "no_active_appointment":
          return "Não encontrei nenhum agendamento ativo seu. Quer marcar um novo?";
        case "appointment_not_found":
        case "already_cancelled":
          return "Esse agendamento não está mais ativo no sistema. Quer marcar um novo?";
        case "service_not_found":
        case "service_missing":
          return "Não consegui localizar esse serviço no nosso catálogo. Pode confirmar o nome?";
        case "missing_phone":
        case "contact_create_failed":
          return "Tive um problema ao registrar seus dados. Pode me confirmar seu nome, por favor?";
        case "professional_required":
          return "Preciso saber com qual profissional você quer marcar — pode me confirmar o nome?";
        case "client_name_required":
          return "Para registrar o agendamento eu preciso do nome da pessoa que vai ser atendida. Como ela se chama?";
        case "malformed_batch":
          return "Tive um problema técnico ao processar os agendamentos — pode repetir os horários desejados, um de cada vez?";
        default:
          return action === "reschedule"
            ? "Não consegui concluir o reagendamento aqui. Pode tentar de novo me dizendo o novo horário?"
            : action === "cancel"
              ? "Não consegui concluir o cancelamento aqui. Pode confirmar qual agendamento você quer cancelar?"
              : "Não consegui concluir o agendamento aqui. Pode repetir o horário desejado?";
      }
    };

    // Detecta bloco APPOINTMENT_JSON emitido pela IA (objeto único ou lote em array)
    {
      const extraction = extractAppointmentPayloads(text);
      if (extraction) {
        const skip = asksForConfirmation || userWantsCancel || userWantsReschedule;
        text = extraction.cleanedText;
        if (skip) {
          console.warn("[ai booking] APPOINTMENT_JSON ignorado (protocolo/intenção)", {
            asksForConfirmation,
            userWantsCancel,
            userWantsReschedule,
          });
        } else if (extraction.payloads.length === 0) {
          // Marcador presente mas nada parseável (JSON quebrado/blob inválido).
          if (extraction.malformedCount > 0) text = friendlyReason("create", "malformed_batch");
        } else {
          const enriched = extraction.payloads.map((p) => ({
            ...p,
            contact_id: data.contact_id ?? (p as any).contact_id ?? null,
            client_phone: (p as any).client_phone || knownPhone || undefined,
            client_name: (p as any).client_name || knownName || undefined,
          }));
          if (data.preview) {
            // preview: não cria de fato, só valida que chegou até aqui.
          } else if (enriched.length === 1) {
            const r = await createAppointmentFromAI(enriched[0] as any, {
              id: profile.id,
              business_timezone: profile.business_timezone ?? null,
              business_name: profile.business_name ?? null,
              business_hours: bizHours,
            });
            if (!r.ok) {
              console.warn("[ai booking] falhou:", r.reason);
              text = friendlyReason("create", r.reason, r);
            } else if (r.confirmation_sent) {
              // O template (personalizável em Configurações) já foi enviado —
              // evita duplicar com a frase solta da IA.
              text = "";
            }
          } else {
            const batch = await createAppointmentBatchFromAI(enriched as any, {
              id: profile.id,
              business_timezone: profile.business_timezone ?? null,
              business_name: profile.business_name ?? null,
              business_hours: bizHours,
            });
            if (batch.allFailed) {
              text = friendlyReason("create", batch.results[0]?.reason, batch.results[0]);
            } else if (batch.anyFailed) {
              text = batch.summaryTextForAi;
            } else if (batch.confirmationSent) {
              text = "";
            }
          }
        }
      }
    }

    // Detecta bloco RESCHEDULE_JSON. Aceita objeto único OU array — o cliente
    // pode remarcar mais de um agendamento no mesmo turno (ex.: o dele e o de
    // um familiar). O texto é limpo SEMPRE, mesmo com JSON quebrado.
    if (canReschedule) {
      const extraction = extractJsonBlocks(text, "RESCHEDULE_JSON:");
      if (extraction) {
        text = extraction.cleanedText;
        if (asksForConfirmation) {
          console.warn("[ai reschedule] ignorado: ainda pedindo confirmação");
        } else if (extraction.payloads.length === 0) {
          console.warn("[ai reschedule] nenhum payload parseável");
          text = friendlyReason("reschedule", "bad_date");
        } else if (!data.preview) {
          let allOk = true;
          let allConfirmed = true;
          let firstFail: {
            reason?: string;
            professional_name?: string | null;
            working_hours_hint?: string;
          } = {};
          // Sequencial de propósito: cada remarcação libera/ocupa slot e a
          // próxima precisa enxergar o estado já persistido.
          for (const payload of extraction.payloads) {
            console.log("[ai reschedule] payload:", JSON.stringify(payload));
            const r = await rescheduleAppointmentFromAI(
              { ...(payload as any), contact_id: data.contact_id ?? null },
              {
                id: profile.id,
                business_hours: bizHours,
                business_timezone: profile.business_timezone ?? null,
                business_name: profile.business_name ?? null,
              },
            );
            if (!r.ok) {
              allOk = false;
              if (!firstFail.reason) firstFail = r;
              console.warn("[ai reschedule] falhou:", r.reason);
            }
            if (!r.confirmation_sent) allConfirmed = false;
          }
          if (!allOk) text = friendlyReason("reschedule", firstFail.reason, firstFail);
          else if (allConfirmed) text = "";
        }
      }
    }

    // Detecta bloco CANCEL_JSON
    if (canCancel) {
      const extraction = extractJsonBlocks(text, "CANCEL_JSON:");
      if (extraction) {
        text = extraction.cleanedText;
        if (asksForConfirmation) {
          console.warn("[ai cancel] ignorado: ainda pedindo confirmação");
        } else if (extraction.payloads.length === 0) {
          console.warn("[ai cancel] nenhum payload parseável");
          text = friendlyReason("cancel", "bad_date");
        } else if (!data.preview) {
          let allOk = true;
          let allConfirmed = true;
          let firstReason: string | undefined;
          for (const payload of extraction.payloads) {
            console.log("[ai cancel] payload:", JSON.stringify(payload));
            const r = await cancelAppointmentFromAI(
              { ...(payload as any), contact_id: data.contact_id ?? null },
              {
                id: profile.id,
                business_timezone: profile.business_timezone ?? null,
                business_name: profile.business_name ?? null,
              },
            );
            if (!r.ok) {
              allOk = false;
              if (!firstReason) firstReason = r.reason;
              console.warn("[ai cancel] falhou:", r.reason);
            }
            if (!r.confirmation_sent) allConfirmed = false;
          }
          if (!allOk) text = friendlyReason("cancel", firstReason);
          else if (allConfirmed) text = "";
        }
      }
    }

    // Detecta bloco PHOTO_JSON (envio de foto de serviço). Guarda de
    // segurança extra em relação aos outros marcadores: sendServicePhotoFromAI
    // já recheca o toggle no servidor e exige um pedido explícito de foto na
    // última mensagem do cliente — nunca confia só no marcador da IA.
    if (canSendPhotos) {
      const extraction = extractJsonBlocks(text, "PHOTO_JSON:");
      if (extraction) {
        text = extraction.cleanedText;
        if (extraction.payloads.length > 0 && !data.preview) {
          const payload = extraction.payloads[0] as { service_id?: string; photo_id?: string };
          const r = await sendServicePhotoFromAI(
            payload,
            profile.id,
            data.contact_id,
            canSendPhotos,
            data.message ?? "",
          );
          if (!r.ok) {
            console.warn("[ai photo] falhou:", r.reason);
            // Falhas silenciosas (marcador sem pedido explícito, feature
            // desligada etc.) só removem o marcador, sem gerar texto extra —
            // não é uma falha que o cliente precise saber. Só falhas
            // "reais" (serviço/foto não encontrados, erro de envio) ganham
            // uma resposta honesta.
            if (r.reason === "service_not_found" || r.reason === "photo_not_found") {
              text = "No momento não tenho uma foto desse serviço aqui, mas posso te explicar melhor!";
            } else if (r.reason === "send_failed") {
              text =
                "Tive um problema técnico ao enviar a foto agora. Posso te explicar em texto, ou prefere falar com um atendente?";
            }
          }
        }
      }
    }
    const usage = json.usageMetadata ?? {};
    const tokensIn = usage.promptTokenCount ?? 0;
    const tokensOut = usage.candidatesTokenCount ?? 0;
    const tokensTotal = usage.totalTokenCount ?? tokensIn + tokensOut;
    const costCents = estimateCostCents(tokensIn, tokensOut);
    if (!data.preview) {
      await supabaseAdmin.from("ai_usage_logs").insert({
        workspace_owner_id: data.workspace_owner_id,
        segment_id: segment?.id ?? null,
        contact_id: data.contact_id ?? null,
        action: "send_message",
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        tokens_total: tokensTotal,
        cost_estimate_cents: costCents,
        dedup_key: dedupKey,
      });
    }
    // Rede de segurança: nenhum bloco de protocolo pode sair daqui pro cliente,
    // mesmo que um parser acima não tenha casado (foi assim que um
    // RESCHEDULE_JSON em array vazou cru, com uuids, no WhatsApp do cliente).
    const safeText = stripProtocolBlocks(text);
    if (safeText !== text) {
      console.error("[ai] bloco de protocolo escapou dos parsers — texto sanitizado", {
        original: text.slice(0, 300),
      });
    }
    return { action: "send_message", response: safeText, tokens_total: tokensTotal };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!data.preview) {
      await supabaseAdmin.from("ai_usage_logs").insert({
        workspace_owner_id: data.workspace_owner_id,
        segment_id: segment?.id ?? null,
        contact_id: data.contact_id ?? null,
        action: "error",
        error_message: msg.slice(0, 500),
        dedup_key: dedupKey,
      });
    }
    return { action: "error", error: msg };
  }
}
