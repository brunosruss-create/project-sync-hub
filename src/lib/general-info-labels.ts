// Dicionário de rótulos em português das chaves usadas em
// `ai_segments.default_general_info_fields` / `profiles.business_general_info`.
// Fatos do negócio que a IA pode responder quando o cliente perguntar
// (não são perguntas que a IA faz — ver field-labels.ts para isso).
// Módulo puro (sem I/O, sem env) — seguro de importar tanto no servidor
// quanto no cliente.
export const GENERAL_INFO_LABELS: Record<string, string> = {
  estacionamento: "Possui estacionamento?",
  aceita_cartao_credito: "Aceita cartão de crédito?",
  aceita_cartao_debito: "Aceita cartão de débito?",
  aceita_pix: "Aceita PIX?",
  aceita_dinheiro: "Aceita dinheiro?",
  oferece_parcelamento: "Oferece parcelamento?",
  aceita_convenio: "Aceita convênios/planos?",
  acessibilidade_cadeirantes: "Possui acessibilidade para cadeirantes?",
  atende_criancas: "Atende crianças?",
  atende_emergencias: "Atende emergências?",
  wifi_clientes: "Possui Wi-Fi para clientes?",
  ar_condicionado: "Possui ar-condicionado?",
  delivery: "Faz entrega/delivery?",
  agendamento_mesmo_dia: "Aceita agendamento no mesmo dia?",
  atende_fim_de_semana: "Atende aos finais de semana?",
};
