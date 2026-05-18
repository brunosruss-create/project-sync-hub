import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAppointmentFromAI,
  rescheduleAppointmentFromAI,
  cancelAppointmentFromAI,
} from "@/lib/booking-confirmation.server";

import { MESSAGE_DEFAULTS } from "@/lib/message-defaults";
import { renderTemplate } from "@/lib/message-templates";

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
  ai_required_fields: string[];
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
};

export type AiRunResult =
  | { action: "skip"; reason: string }
  | { action: "send_out_of_hours"; response: string }
  | { action: "transfer_to_human"; response: string }
  | { action: "send_message"; response: string; tokens_total: number }
  | { action: "error"; error: string };

function isWithinHours(
  hours: WorkingHours | null | undefined,
  timezone: string,
): boolean {
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
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
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
    if (hours[k]) { cfg = hours[k]; matchedKey = k; break; }
  }
  if (!cfg) {
    console.log("[ai hours] dia não configurado", { tz, dayIdx, wdShort, keys: Object.keys(hours) });
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
      tz, matchedKey, nowMin, startMin, endMin,
    });
  }
  return within;
}

const TONE_MAP: Record<string, string> = {
  amigavel:
    "Use linguagem cordial, próxima e acessível. Evite termos técnicos desnecessários.",
  amigável:
    "Use linguagem cordial, próxima e acessível. Evite termos técnicos desnecessários.",
  formal: "Use linguagem formal e profissional.",
  casual:
    "Use linguagem leve, casual e próxima. Pode usar expressões do dia a dia.",
  descontraido:
    "Use linguagem leve, casual e próxima. Pode usar expressões do dia a dia.",
  descontraído:
    "Use linguagem leve, casual e próxima. Pode usar expressões do dia a dia.",
  tecnico:
    "Use linguagem técnica e precisa. O cliente espera respostas especializadas.",
  técnico:
    "Use linguagem técnica e precisa. O cliente espera respostas especializadas.",
};

const FIELD_LABELS: Record<string, string> = {
  placa: "placa do veículo",
  marca: "marca do veículo",
  modelo: "modelo do veículo",
  ano: "ano do veículo",
  descricao_problema: "descrição do problema",
  area_interesse: "área de interesse (rosto ou corpo)",
  primeira_vez_ou_retorno: "se é primeira consulta ou retorno",
  especialidade: "especialidade desejada",
  convenio_ou_particular: "se vai usar convênio ou particular",
  emergencia_ou_eletivo: "se é emergência ou consulta eletiva",
  primeira_vez_ou_paciente: "se é a primeira vez ou já é paciente",
  tem_pedido_medico: "se tem pedido médico",
  tipo_aparelho: "tipo de aparelho",
  problema: "descrição do problema",
  em_garantia: "se ainda está na garantia",
  nome_animal: "nome do animal",
  especie: "espécie do animal",
  raca: "raça do animal",
  idade: "idade do animal",
  peso: "peso do animal",
  tipo_veiculo: "tipo do veículo (hatch, sedan, SUV, caminhonete)",
  porte_veiculo: "porte do veículo",
  objetivo_principal: "objetivo principal do cliente",
  area_do_direito: "área do direito envolvida",
  objetivo:
    "objetivo (emagrecer, ganhar massa, condicionamento, reabilitação)",
  nivel_experiencia: "nível de experiência",
  queixa_principal:
    "queixa principal (dor nas costas, lesão esportiva, pós-operatório, etc.)",
  servico_desejado: "serviço desejado",
};

function buildWorkspaceLayer(
  p: Record<string, any> & Partial<AiBehaviorConfig> & {
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
      const intro = mentionBusiness && business
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
  const pricePolicy: PriceDisclosurePolicy =
    (p.ai_price_disclosure_policy as PriceDisclosurePolicy) ?? "on_request";
  if (pricePolicy === "always") {
    parts.push(
      `Informe os preços dos serviços proativamente quando apresentar opções ao cliente.`,
    );
  } else if (pricePolicy === "on_request") {
    parts.push(
      `Só informe preços se o cliente perguntar de forma direta e literal sobre valores. Não cite preços, "a partir de", faixas, descontos ou estimativas espontaneamente.`,
    );
  } else if (pricePolicy === "never") {
    prohibitions.push(
      `OBRIGATÓRIO: NUNCA, sob nenhuma circunstância, informe valores, preços, faixas, "a partir de", estimativas, descontos, condições de pagamento ou ordens de grandeza. Se o cliente perguntar preço, responda exatamente: "Os valores são informados diretamente por um atendente. Vou encaminhar seu contato."`,
    );
  }

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
  const workspaceFields: string[] = Array.isArray(p.ai_required_fields)
    ? (p.ai_required_fields as string[])
    : [];
  const segmentFields: string[] = Array.isArray(p.segment_default_required_fields)
    ? (p.segment_default_required_fields as string[])
    : [];
  const requiredFields =
    workspaceFields.length > 0 ? workspaceFields : segmentFields;

  if (requiredFields.length > 0) {
    const labels = requiredFields
      .map((f) => FIELD_LABELS[f] ?? f)
      .join(", ");
    parts.push(
      `Antes de qualquer ação (orçamento, agendamento, encaminhamento), colete as seguintes informações se ainda não fornecidas: ${labels}.`,
    );
  }

  // === INSTRUÇÕES ESPECÍFICAS DO WORKSPACE ===
  if (p.ai_custom_prompt) {
    parts.push(
      `Instruções específicas do estabelecimento: ${p.ai_custom_prompt}`,
    );
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
    category_id: string | null;
  }>,
  categoryNameById: Record<string, string>,
  pricePolicy: PriceDisclosurePolicy,
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
      "   \"No momento ainda não temos o catálogo de serviços cadastrado por aqui. Vou encaminhar você para um atendente humano que pode te passar todos os detalhes.\"",
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
    const dur =
      s.duration_minutes && s.duration_minutes > 0
        ? `${s.duration_minutes} min`
        : null;
    const header = dur ? `- ${s.name} (${dur})` : `- ${s.name}`;
    lines.push(header);
    if (s.category_id && categoryNameById[s.category_id]) {
      lines.push(`  Categoria: ${categoryNameById[s.category_id]}`);
    }
    const desc = (s.description ?? "").trim();
    if (desc) {
      lines.push(`  Descrição: ${desc}`);
    } else {
      lines.push(
        `  Descrição: (não informada — não invente detalhes deste serviço; se perguntarem, diga que vai pedir mais informações a um atendente)`,
      );
    }
    if (pricePolicy === "always") {
      const price = formatPriceBRL(s.price_cents);
      if (price) lines.push(`  Valor: ${price}`);
    }
    lines.push("");
  }

  lines.push("REGRAS DE USO DESTE CATÁLOGO:");
  lines.push(
    "1. Ao apresentar os serviços, NÃO recite a lista crua. Use a Descrição de cada serviço para responder de forma natural e contextualizada ao que o cliente perguntou.",
  );
  lines.push(
    "2. Se a pergunta for genérica (\"o que vocês fazem?\"), faça um resumo curto cobrindo os serviços disponíveis com base nas descrições.",
  );
  lines.push(
    "3. Se a pergunta for específica (\"vocês fazem X?\"), responda APENAS com base na descrição do serviço correspondente.",
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

  return lines.join("\n");
}

type ProRow = { id: string; name: string; role: string | null };
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
      monday: "Seg", mon: "Seg",
      tuesday: "Ter", tue: "Ter",
      wednesday: "Qua", wed: "Qua",
      thursday: "Qui", thu: "Qui",
      friday: "Sex", fri: "Sex",
      saturday: "Sáb", sat: "Sáb",
      sunday: "Dom", sun: "Dom",
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
    lines.push(`- ${p.name}${roleStr}`);
    const appts = (byPro.get(p.id) ?? []).slice(0, 12);
    if (appts.length === 0) {
      lines.push(`  Próximos 7 dias: sem compromissos cadastrados.`);
    } else {
      lines.push(`  Compromissos já marcados (próximos 7 dias):`);
      for (const a of appts) {
        const d = new Date(a.starts_at);
        const e = new Date(a.ends_at);
        lines.push(
          `    • ${fmtDate.format(d)} ${fmtTime.format(d)}–${fmtTime.format(e)}`,
        );
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
};

function buildContactAppointmentsLayer(
  rows: ContactApptRow[],
  tz: string,
): string | null {
  if (!rows || rows.length === 0) {
    return [
      "=== AGENDAMENTOS DESTE CLIENTE ===",
      "Este cliente NÃO possui nenhum agendamento ativo nem recente nos registros.",
      "Se ele perguntar 'quando eu tenho consulta marcada?', 'meu horário', 'minha próxima consulta', responda EXATAMENTE com base nesta informação — diga que não há agendamento ativo no sistema e pergunte se ele quer marcar um novo. Não invente datas.",
    ].join("\n");
  }
  const fmtDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const fmtTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const lines: string[] = [];
  lines.push("=== AGENDAMENTOS DESTE CLIENTE (FONTE ÚNICA DE VERDADE) ===");
  lines.push(
    "Use APENAS esta lista para responder qualquer pergunta sobre 'minha consulta', 'meu horário', 'quando eu tenho marcado', 'consulta agendada'. Nunca diga que não tem acesso à agenda — você TEM.",
  );
  lines.push("");
  for (const r of rows) {
    const d = new Date(r.starts_at);
    const status = r.status === "cancelled" ? " (CANCELADO)" : r.status === "completed" ? " (CONCLUÍDO)" : "";
    const svc = r.service_name ?? "atendimento";
    const pro = r.professional_name ? ` com ${r.professional_name}` : "";
    lines.push(`- [id:${r.id}] ${fmtDate.format(d)} às ${fmtTime.format(d)} — ${svc}${pro}${status}`);
  }
  lines.push("");
  lines.push("REGRAS:");
  lines.push("1. Ao informar a consulta ao cliente, escreva data e hora em linguagem natural — NUNCA mostre o [id:...] pra ele.");
  lines.push("2. Os IDs entre colchetes são usados APENAS por você nos blocos RESCHEDULE_JSON / CANCEL_JSON.");
  lines.push("3. Agendamentos marcados (CANCELADO) ou (CONCLUÍDO) NÃO podem ser reagendados nem cancelados de novo — informe o cliente caso ele tente.");
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

  const segment = (profile as any).ai_segments as
    | {
        id: string;
        segment_prompt: string | null;
        default_transfer_keywords: string[] | null;
        default_required_fields: string[] | null;
      }
    | null;

  // ===== CATÁLOGO DE SERVIÇOS (fonte única de verdade) =====
  // Carrega os serviços ativos do workspace + categorias para nomear cada um.
  // A IA NUNCA deve inferir serviços a partir de business_description,
  // segmento ou nome — só pode falar do que está aqui.
  const { data: activeServices } = await supabaseAdmin
    .from("services")
    .select("name,description,duration_minutes,price_cents,category_id")
    .eq("owner_user_id", data.workspace_owner_id)
    .eq("status", "active")
    .order("name", { ascending: true });

  let categoryNameById: Record<string, string> = {};
  const categoryIds = Array.from(
    new Set((activeServices ?? []).map((s) => s.category_id).filter(Boolean)),
  ) as string[];
  if (categoryIds.length > 0) {
    const { data: cats } = await supabaseAdmin
      .from("service_categories")
      .select("id,name")
      .in("id", categoryIds);
    categoryNameById = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));
  }

  const pricePolicyForCatalog: PriceDisclosurePolicy =
    ((profile as any).ai_price_disclosure_policy as PriceDisclosurePolicy) ?? "on_request";

  const servicesLayer = buildServicesLayer(activeServices ?? [], categoryNameById, pricePolicyForCatalog);

  // ===== PROFISSIONAIS + AGENDA (próximos 7 dias) =====
  const { data: prosRows } = await supabaseAdmin
    .from("professionals")
    .select("id,name,role")
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
  // Existem duas telas de configuração (Negócio e IA) que salvam em campos
  // separados e com chaves diferentes (ex: "fri" vs "friday"). Para evitar
  // que uma sobrescreva a outra, consideramos atendendo se QUALQUER uma das
  // configurações preenchidas indicar que estamos no horário.
  const sources: { name: string; hours: WorkingHours }[] = [];
  if (bizHours && typeof bizHours === "object" && Object.keys(bizHours).length > 0) {
    sources.push({ name: "business_hours", hours: bizHours });
  }
  if (aiHours && typeof aiHours === "object" && Object.keys(aiHours).length > 0) {
    sources.push({ name: "ai_working_hours", hours: aiHours });
  }
  console.log("[ai hours] check", {
    tz,
    sources: sources.map((s) => s.name),
  });
  const sourceResults = sources.map((s) => ({
    name: s.name,
    within: isWithinHours(s.hours, tz),
  }));
  const withinAny =
    sourceResults.length === 0 || sourceResults.some((s) => s.within);
  if (!withinAny) {
    // SEGURANCA: a mensagem fora do horario so e enviada quando o usuario
    // optou EXPLICITAMENTE por ativar. Se nao houver coluna nem marcador
    // no JSON, assumimos FALSE para evitar spam quando o workspace nao
    // configurou nada (caso comum em ambientes antigos).
    const columnValue =
      typeof profile.ai_out_of_hours_enabled === "boolean"
        ? profile.ai_out_of_hours_enabled
        : null;
    const jsonFallback =
      typeof aiHours?.__out_of_hours?.enabled === "boolean"
        ? aiHours.__out_of_hours.enabled
        : null;
    const outEnabled = columnValue ?? jsonFallback ?? false;
    console.log("[ai hours] decision", {
      tz,
      sourceResults,
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
      (typeof profile.ai_out_of_hours_message === "string" && profile.ai_out_of_hours_message.trim())
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
      .select(
        "id,starts_at,ends_at,status,services(name),professionals(name)",
      )
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

  // Agendamento autônomo pela IA — sempre habilitado (link público foi removido).
  const canReschedule = !!(profile as any).ai_can_reschedule;
  const canCancel = !!(profile as any).ai_can_cancel;
  const bookingParts: string[] = [];
  bookingParts.push(
    [
      "=== AGENDAMENTO AUTÔNOMO PELA IA ===",
      "Você É RESPONSÁVEL por agendar diretamente na conversa — NÃO existe link externo, NÃO ofereça nenhum link. Use a lista de PROFISSIONAIS e a agenda em tempo real acima para propor horários livres dentro do horário de funcionamento.",
      "",
      "FLUXO OBRIGATÓRIO antes de criar qualquer agendamento:",
      "1. Identifique: SERVIÇO desejado (da lista de serviços), DATA + HORA (use o bloco DATA E HORA ATUAIS), e PROFISSIONAL (se houver mais de um).",
      "2. NÃO peça telefone — use o telefone do WhatsApp (bloco DADOS JÁ CONHECIDOS). Use o Nome do WhatsApp como nome, a menos que precise do nome completo.",
      "3. Cheque na lista de COMPROMISSOS do profissional se o horário está livre. Se não estiver, ofereça 2–3 alternativas livres mais próximas.",
      "4. Faça um RESUMO de confirmação para o cliente, ex.: \"Confirmo então: {serviço} com {profissional} em {data} às {hora}, no nome de {nome}. Posso confirmar?\" — NÃO mencione telefone nesse resumo.",
      "5. SÓ emita o bloco APPOINTMENT_JSON depois que o cliente responder confirmando (ex.: \"sim\", \"pode confirmar\", \"isso\"). NUNCA emita o JSON na mesma mensagem do resumo.",
      "",
      "Quando o cliente confirmar TEXTUALMENTE o agendamento, inclua no FINAL da sua resposta uma única linha com este bloco JSON exato (sem markdown, sem comentário antes ou depois):",
      'APPOINTMENT_JSON:{"service_name":"...","starts_at":"YYYY-MM-DDTHH:mm:00-03:00","client_name":"...","client_phone":"...","professional_id":null}',
      "- client_phone: SEMPRE o telefone do WhatsApp acima (não invente, não peça).",
      "- client_name: o nome do WhatsApp (ou o nome completo se o cliente informou).",
      "- professional_id: uuid de um profissional da lista quando souber; caso contrário, null.",
      "Nunca invente dados. Nunca emita esse bloco sem confirmação prévia do cliente.",
      "",
      "DEPOIS DE CRIAR O AGENDAMENTO: na PRÓXIMA mensagem do cliente, o novo agendamento já estará disponível no bloco AGENDAMENTOS DESTE CLIENTE acima. Use ELE como fonte da verdade para qualquer pergunta de 'quando é minha consulta', 'pode confirmar meu horário', etc. NUNCA diga que não tem acesso à agenda.",
    ].join("\n"),
  );
  if (canReschedule) {
    bookingParts.push(
      `REAGENDAMENTO: Se o cliente confirmar TEXTUALMENTE uma nova data/hora para um agendamento existente (referencie pelo [id:...] da lista de AGENDAMENTOS DESTE CLIENTE), inclua no FINAL da sua resposta uma única linha com este bloco JSON exato:\nRESCHEDULE_JSON:{"appointment_id":"<uuid-do-id-da-lista>","new_starts_at":"YYYY-MM-DDTHH:mm:00-03:00"}\nSó emita esse bloco quando o cliente confirmar literalmente a nova data/hora. Use o uuid EXATO da lista de agendamentos.`,
    );
  }
  if (canCancel) {
    bookingParts.push(
      `CANCELAMENTO: Se o cliente confirmar TEXTUALMENTE o cancelamento de um agendamento existente, inclua no FINAL da sua resposta uma única linha com este bloco JSON exato:\nCANCEL_JSON:{"appointment_id":"<uuid-do-id-da-lista>","reason":"motivo curto"}\nSó emita esse bloco depois da confirmação explícita do cliente (ex.: "sim, pode cancelar"). Use o uuid EXATO da lista.`,
    );
  }
  bookingParts.push(
    `REGRA: Você só pode emitir UM bloco JSON por resposta (APPOINTMENT_JSON, RESCHEDULE_JSON ou CANCEL_JSON). Nunca emita dois ao mesmo tempo.`,
  );
  const bookingLayer = bookingParts.length > 0 ? bookingParts.join("\n\n") : null;

  const professionalsLayer = buildProfessionalsLayer(pros, upcoming, bizHours, tz);

  const finalPrompt = [
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
    contactApptsLayer,
    servicesLayer,
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

    // Detecta bloco APPOINTMENT_JSON emitido pela IA
    {
      const match = text.match(/APPOINTMENT_JSON:(\{[\s\S]*?\})\s*$/);
      if (match) {
        try {
          const payload = JSON.parse(match[1]);
          await createAppointmentFromAI(payload, {
            id: profile.id,
            business_timezone: profile.business_timezone ?? null,
            business_name: profile.business_name ?? null,
          });
        } catch (err) {
          console.warn("[ai booking] parse/create falhou:", (err as Error)?.message);
        }
        // Remove o bloco da resposta enviada ao cliente
        text = text.replace(/APPOINTMENT_JSON:\{[\s\S]*?\}\s*$/, "").trim();
      }
    }

    // Detecta bloco RESCHEDULE_JSON
    if (canReschedule) {
      const m = text.match(/RESCHEDULE_JSON:(\{[\s\S]*?\})\s*$/);
      if (m) {
        try {
          const payload = JSON.parse(m[1]);
          const result = await rescheduleAppointmentFromAI(
            { ...payload, contact_id: data.contact_id ?? null },
            {
              id: profile.id,
              business_timezone: profile.business_timezone ?? null,
              business_name: profile.business_name ?? null,
            },
          );
          if (!result.ok) {
            console.warn("[ai reschedule] falhou:", result.reason);
          }
        } catch (err) {
          console.warn("[ai reschedule] parse falhou:", (err as Error)?.message);
        }
        text = text.replace(/RESCHEDULE_JSON:\{[\s\S]*?\}\s*$/, "").trim();
      }
    }

    // Detecta bloco CANCEL_JSON
    if (canCancel) {
      const m = text.match(/CANCEL_JSON:(\{[\s\S]*?\})\s*$/);
      if (m) {
        try {
          const payload = JSON.parse(m[1]);
          const result = await cancelAppointmentFromAI(
            { ...payload, contact_id: data.contact_id ?? null },
            {
              id: profile.id,
              business_timezone: profile.business_timezone ?? null,
              business_name: profile.business_name ?? null,
            },
          );
          if (!result.ok) {
            console.warn("[ai cancel] falhou:", result.reason);
          }
        } catch (err) {
          console.warn("[ai cancel] parse falhou:", (err as Error)?.message);
        }
        text = text.replace(/CANCEL_JSON:\{[\s\S]*?\}\s*$/, "").trim();
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
    return { action: "send_message", response: text, tokens_total: tokensTotal };
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
