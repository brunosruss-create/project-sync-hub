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
  // atende_fim_de_semana removido: já é coberto por "Horários de
  // funcionamento" (business_hours cobre cada dia da semana individualmente).
};

// Placeholder de exemplo pro campo de observação que aparece quando o tenant
// marca "Sim" — só ilustra o tipo de detalhe esperado, nunca é preenchido
// automaticamente nem é obrigatório.
export const GENERAL_INFO_NOTE_PLACEHOLDERS: Record<string, string> = {
  estacionamento: "Ex.: com manobrista",
  aceita_cartao_credito: "Ex.: Visa, Master, Elo",
  aceita_cartao_debito: "Ex.: todas as bandeiras",
  oferece_parcelamento: "Ex.: até 3x sem juros",
  aceita_convenio: "Ex.: Unimed, Bradesco Saúde",
  acessibilidade_cadeirantes: "Ex.: rampa de acesso e banheiro adaptado",
  atende_criancas: "Ex.: a partir de 5 anos",
  atende_emergencias: "Ex.: apenas em horário comercial",
  wifi_clientes: "Ex.: senha fornecida na recepção",
  delivery: "Ex.: raio de 5km, taxa a combinar",
  agendamento_mesmo_dia: "Ex.: sujeito à disponibilidade",
};
