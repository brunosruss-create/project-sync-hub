// Fonte única de verdade para todas as mensagens automáticas enviadas
// ao cliente final. Tanto a UI (settings/messages) quanto o servidor
// (booking-confirmation, ai-respond, evolution webhook) leem daqui.

export type MessageKey =
  | "welcome"
  | "out_of_hours"
  | "transfer"
  | "booking_confirmed"
  | "booking_rescheduled"
  | "booking_cancelled";

export type MessageMeta = {
  key: MessageKey;
  label: string;
  description: string;
  placeholders: string[]; // documenta {{vars}} disponíveis
  preview: Record<string, string>; // valores fictícios p/ preview
  default: string;
};

export const MESSAGE_DEFAULTS: Record<MessageKey, MessageMeta> = {
  welcome: {
    key: "welcome",
    label: "Boas-vindas",
    description:
      "Enviada automaticamente na primeira mensagem de um novo contato.",
    placeholders: ["{{cliente}}", "{{negocio}}"],
    preview: { cliente: "João", negocio: "Salão Bela Vista" },
    default:
      "Olá! Bem-vindo(a) ao {{negocio}}. Em instantes um atendente irá responder.",
  },
  out_of_hours: {
    key: "out_of_hours",
    label: "Fora do horário",
    description:
      "Resposta automática quando o cliente escreve fora do horário de atendimento da IA.",
    placeholders: ["{{negocio}}"],
    preview: { negocio: "Salão Bela Vista" },
    default:
      "Olá! No momento estamos fora do horário de atendimento do {{negocio}}. Retornaremos em breve.",
  },
  transfer: {
    key: "transfer",
    label: "Transferência para atendente",
    description:
      "Enviada quando a IA detecta intenção de falar com humano (palavras-chave).",
    placeholders: ["{{cliente}}"],
    preview: { cliente: "João" },
    default:
      "Entendi! Vou passar você para um atendente humano agora. Aguarde um momento.",
  },
  booking_confirmed: {
    key: "booking_confirmed",
    label: "Agendamento confirmado",
    description:
      "Enviada ao cliente quando um agendamento é criado com sucesso.",
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
      "Olá {{cliente}}!\n\n" +
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
      "Enviada ao cliente quando a data ou hora de um agendamento muda.",
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
      "Olá {{cliente}}!\n\n" +
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
      "Enviada ao cliente quando um agendamento é marcado como cancelado.",
    placeholders: [
      "{{cliente}}",
      "{{negocio}}",
      "{{data}}",
      "{{hora}}",
      "{{servico}}",
    ],
    preview: {
      cliente: "João",
      negocio: "Salão Bela Vista",
      data: "segunda-feira, 10 de junho de 2026",
      hora: "14:00",
      servico: "Corte masculino",
    },
    default:
      "Olá {{cliente}}.\n\n" +
      "Seu agendamento em *{{negocio}}* foi *cancelado*:\n\n" +
      "{{data}} às {{hora}}\n" +
      "{{servico}}\n\n" +
      "Caso queira remarcar, é só responder esta mensagem.",
  },
};

export const MESSAGE_ORDER: MessageKey[] = [
  "welcome",
  "out_of_hours",
  "transfer",
  "booking_confirmed",
  "booking_rescheduled",
  "booking_cancelled",
];
