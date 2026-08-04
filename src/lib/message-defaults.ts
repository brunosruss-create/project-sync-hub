// Fonte única de verdade para todas as mensagens automáticas enviadas
// ao cliente final. Tanto a UI (settings/messages) quanto o servidor
// (booking-confirmation, ai-respond, evolution webhook) leem daqui.

export type MessageKey =
  | "welcome"
  | "out_of_hours"
  | "transfer"
  | "booking_confirmed"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "csat_survey";

export type MessageMeta = {
  key: MessageKey;
  label: string;
  description: string;
  placeholders: string[]; // documenta {{vars}} disponíveis
  preview: Record<string, string>; // valores fictícios p/ preview
  default: string;
};

// Mensagem agregada enviada quando 2+ agendamentos são criados no mesmo
// turno pela IA (ex.: cliente pede um horário pra ele e um pra um familiar).
// Não é um MessageKey configurável na tela de Mensagens (caso raro,
// complementar ao booking_confirmed normal) — só reaproveita o enabled/flag
// de booking_confirmed pra respeitar se o usuário desativou confirmações.
// {{lista}} é montado em código (não suporta loop no renderTemplate normal).
// Sem saudação: sai sempre no meio de uma conversa já em andamento.
export const BOOKING_CONFIRMED_BATCH_DEFAULT =
  "Agendamentos em *{{negocio}}*:\n{{lista}}\n\n" + "Até lá! 😊";

export const MESSAGE_DEFAULTS: Record<MessageKey, MessageMeta> = {
  welcome: {
    key: "welcome",
    label: "Boas-vindas",
    description:
      "Enviada na primeira mensagem de um novo contato. Quando a IA está ativa, esta mensagem NÃO é enviada — a própria IA faz a saudação usando o nome do assistente e do negócio.",
    placeholders: ["{{cliente}}", "{{negocio}}"],
    preview: { cliente: "João", negocio: "Salão Bela Vista" },
    default: "Olá! Recebemos sua mensagem no {{negocio}} e já vamos te atender. 😊",
  },
  out_of_hours: {
    key: "out_of_hours",
    label: "Fora do horário",
    description:
      "Resposta automática quando o cliente escreve fora do horário de atendimento da IA.",
    placeholders: ["{{negocio}}"],
    preview: { negocio: "Salão Bela Vista" },
    default:
      "No momento estamos fora do horário de atendimento do {{negocio}}. Retornaremos em breve.",
  },
  transfer: {
    key: "transfer",
    label: "Transferência para atendente",
    description: "Enviada quando a IA detecta intenção de falar com humano (palavras-chave).",
    placeholders: ["{{cliente}}"],
    preview: { cliente: "João" },
    default: "Entendi! Vou passar você para um atendente humano agora. Aguarde um momento.",
  },
  booking_confirmed: {
    key: "booking_confirmed",
    label: "Agendamento confirmado",
    description:
      "Enviada ao cliente quando um agendamento é criado com sucesso — inclusive quando é a IA que agenda dentro da conversa (nesse caso a IA não repete a confirmação em texto solto).",
    placeholders: [
      "{{cliente}}",
      "{{negocio}}",
      "{{data}}",
      "{{hora}}",
      "{{servico}}",
      "{{profissional}}",
    ],
    preview: {
      cliente: "João",
      negocio: "Salão Bela Vista",
      data: "segunda-feira, 10 de junho de 2026",
      hora: "14:00",
      servico: "Corte masculino",
      profissional: "Carla",
    },
    default:
      "Seu agendamento em *{{negocio}}* foi confirmado:\n\n" +
      "*{{data}} às {{hora}}*\n" +
      "{{servico}}\n" +
      "{{profissional}}\n\n" +
      "Até lá! 😊",
  },
  booking_rescheduled: {
    key: "booking_rescheduled",
    label: "Agendamento reagendado",
    description:
      "Enviada ao cliente quando a data ou hora de um agendamento muda — inclusive quando é a IA que reagenda dentro da conversa (nesse caso a IA não repete a confirmação em texto solto).",
    placeholders: [
      "{{cliente}}",
      "{{negocio}}",
      "{{data}}",
      "{{hora}}",
      "{{servico}}",
      "{{profissional}}",
    ],
    preview: {
      cliente: "João",
      negocio: "Salão Bela Vista",
      data: "terça-feira, 11 de junho de 2026",
      hora: "15:30",
      servico: "Corte masculino",
      profissional: "Carla",
    },
    default:
      "Seu agendamento em *{{negocio}}* foi *reagendado*:\n\n" +
      "*{{data}} às {{hora}}*\n" +
      "{{servico}}\n" +
      "{{profissional}}\n\n" +
      "Até lá! 😊",
  },
  booking_cancelled: {
    key: "booking_cancelled",
    label: "Agendamento cancelado",
    description:
      "Enviada ao cliente quando um agendamento é marcado como cancelado — inclusive quando é a IA que cancela dentro da conversa (nesse caso a IA não repete a confirmação em texto solto).",
    placeholders: ["{{cliente}}", "{{negocio}}", "{{data}}", "{{hora}}", "{{servico}}"],
    preview: {
      cliente: "João",
      negocio: "Salão Bela Vista",
      data: "segunda-feira, 10 de junho de 2026",
      hora: "14:00",
      servico: "Corte masculino",
    },
    default:
      "Seu agendamento em *{{negocio}}* foi *cancelado*:\n\n" +
      "{{data}} às {{hora}}\n" +
      "{{servico}}\n\n" +
      "Caso queira remarcar, é só responder esta mensagem.",
  },
  csat_survey: {
    key: "csat_survey",
    label: "Pesquisa de satisfação",
    description:
      "Enviada alguns minutos depois de a conversa ser marcada como resolvida. O cliente responde com um número de 1 a 5 e a nota entra no relatório de Atendimento. Se ele responder outra coisa, a pesquisa é descartada e a conversa reabre normalmente. Nasce desativada: é uma mensagem que parte de você, não uma resposta ao cliente.",
    placeholders: ["{{cliente}}", "{{negocio}}"],
    preview: { cliente: "João", negocio: "Salão Bela Vista" },
    // A faixa precisa estar explícita no texto: sem isso o cliente responde
    // "10" achando que é escala de 0 a 10, e a nota é descartada.
    default:
      "Oi {{cliente}}! Como você avalia o atendimento em *{{negocio}}*?\n\n" +
      "Responda com um número de *1 a 5* — sendo 1 péssimo e 5 excelente. 🙂",
  },
};

export const MESSAGE_ORDER: MessageKey[] = [
  "welcome",
  "out_of_hours",
  "transfer",
  "booking_confirmed",
  "booking_rescheduled",
  "booking_cancelled",
  "csat_survey",
];
