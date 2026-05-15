import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
}

export type AiRunInput = {
  workspace_owner_id: string;
  contact_id?: string | null;
  message: string;
  conversation_history?: { role: "user" | "assistant"; content: string }[];
  preview?: boolean;
  /** Stable id da mensagem do WhatsApp (m.key.id). Quando presente, é usado como dedup_key. */
  wa_message_id?: string | null;
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

  // === TOM DE VOZ ===
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

  // === PROFISSIONAIS ===
  const hasMultiple = p.ai_has_multiple_professionals ?? false;
  if (!hasMultiple) {
    prohibitions.push(
      `OBRIGATÓRIO: NÃO pergunte com qual profissional o cliente quer ser atendido. Há apenas um profissional disponível neste negócio.`,
    );
  } else {
    parts.push(
      `Este negócio tem mais de um profissional. Quando relevante para agendamento, pergunte com qual profissional o cliente prefere ser atendido.`,
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
7. Se não souber algo ou não puder executar uma ação, diga que vai encaminhar para um atendente humano.
8. Nunca pressione o cliente. Não use táticas de urgência artificial.
9. Se uma proibição inviolável deste workspace conflita com o pedido do cliente, a proibição vence — sem exceções.
`.trim(),
  );

  return parts.join("\n");
}

function estimateCostCents(input: number, output: number) {
  const cents = (input / 1_000_000) * 25 + (output / 1_000_000) * 150;
  return Math.max(1, Math.round(cents));
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

  const tz =
    (profile.ai_timezone as string | null) ||
    (profile.business_timezone as string | null) ||
    "America/Sao_Paulo";
  if (!isWithinHours(profile.ai_working_hours as WorkingHours, tz)) {
    const out = profile.ai_out_of_hours_message ?? "Estamos fora do horário de atendimento.";
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
    if (!data.preview) {
      await supabaseAdmin.from("ai_usage_logs").insert({
        workspace_owner_id: data.workspace_owner_id,
        segment_id: segment?.id ?? null,
        contact_id: data.contact_id ?? null,
        action: "transfer_to_human",
        dedup_key: dedupKey,
      });
    }
    return {
      action: "transfer_to_human",
      response:
        "Entendi! Vou passar você para um atendente humano agora. Aguarde um momento.",
    };
  }

  const isFirstMessage = (data.conversation_history ?? []).length === 0;
  const finalPrompt = [
    g.ai_base_prompt,
    segment?.segment_prompt ?? "",
    buildWorkspaceLayer({
      ...profile,
      segment_default_required_fields: segment?.default_required_fields ?? [],
      __is_first_message: isFirstMessage,
    }),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const model = g.gemini_model || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${g.gemini_api_key}`;
  const contents = [
    ...(data.conversation_history ?? []).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: data.message }] },
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
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
