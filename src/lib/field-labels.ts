// Dicionário de rótulos em português das chaves usadas em
// `ai_segments.default_required_fields` / `profiles.ai_required_fields`.
// Módulo puro (sem I/O, sem env) — seguro de importar tanto no servidor
// (ai-respond.server.ts, ao montar o prompt) quanto no cliente (tela de
// admin de segmentos, para exibir as opções de campo obrigatório).
export const FIELD_LABELS: Record<string, string> = {
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
  objetivo: "objetivo (emagrecer, ganhar massa, condicionamento, reabilitação)",
  nivel_experiencia: "nível de experiência",
  queixa_principal:
    "queixa principal (dor nas costas, lesão esportiva, pós-operatório, etc.)",
  servico_desejado: "serviço desejado",
};
