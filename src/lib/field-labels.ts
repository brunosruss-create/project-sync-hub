// Dicionário de rótulos em português das chaves usadas em
// `ai_segments.default_required_fields` / `profiles.ai_required_fields`.
// Módulo puro (sem I/O, sem env) — seguro de importar tanto no servidor
// (ai-respond.server.ts, ao montar o prompt) quanto no cliente (telas de
// super-admin e do próprio tenant, pra exibir as opções de campo obrigatório).
//
// Labels em forma de pergunta — mesma convenção já usada nos toggles de
// "Comportamento do agente" em _authenticated.ai-agent.tsx (ex.: "A IA se
// apresenta pelo nome ao cliente?").
export const FIELD_LABELS: Record<string, string> = {
  placa: "Qual é a placa do veículo?",
  marca: "Qual é a marca?",
  modelo: "Qual é o modelo?",
  ano: "Qual é o ano do veículo?",
  descricao_problema: "Qual é a descrição do problema?",
  area_interesse: "Qual é a área de interesse (rosto ou corpo)?",
  primeira_vez_ou_retorno: "É primeira consulta ou retorno?",
  especialidade: "Qual especialidade deseja?",
  convenio_ou_particular: "Vai usar convênio ou particular?",
  emergencia_ou_eletivo: "É emergência ou consulta eletiva?",
  primeira_vez_ou_paciente: "É a primeira vez ou já é paciente?",
  tem_pedido_medico: "Possui pedido médico ou encaminhamento?",
  tipo_aparelho: "Qual é o tipo de aparelho?",
  em_garantia: "Ainda está na garantia?",
  nome_animal: "Qual é o nome do animal?",
  especie: "Qual é a espécie do animal?",
  raca: "Qual é a raça do animal?",
  idade: "Qual é a idade do animal?",
  peso: "Qual é o peso do animal?",
  tipo_veiculo: "Qual é o tipo do veículo (hatch, sedan, SUV, caminhonete)?",
  porte_veiculo: "Qual é o porte do veículo?",
  objetivo_principal: "Qual é o objetivo principal do cliente?",
  area_do_direito: "Qual é a área do direito envolvida?",
  objetivo:
    "Qual é o objetivo (emagrecer, ganhar massa, condicionamento, reabilitação)?",
  nivel_experiencia: "Qual é o nível de experiência?",
  queixa_principal:
    "Qual é a queixa principal (dor nas costas, lesão esportiva, pós-operatório, etc.)?",
  servico_desejado: "Qual serviço deseja?",
  restricoes_saude: "Possui alguma restrição de saúde, lesão ou alergia?",
  restricao_alimentar: "Possui alguma restrição alimentar ou alergia?",
  ja_e_cliente: "Já é cliente?",
  modalidade_atendimento: "Prefere atendimento presencial ou online?",
  exames_desejados: "Quais exames deseja realizar?",
  urgencia_resultado: "Tem urgência para o resultado?",
  quimica_cabelo: "O cabelo já possui química ou coloração anterior?",
  referencia_estilo: "Tem alguma referência de estilo ou corte?",
  estado_atual_veiculo: "Como está o estado atual do veículo?",
  preferencia_treino: "Prefere treino em grupo ou individual?",
  processo_em_andamento: "Já possui processo em andamento?",
  motivo_ou_sessao: "Prefere comentar o motivo agora ou deixar para a sessão?",
};
