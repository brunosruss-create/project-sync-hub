-- ============================================================
-- 20260726010000_ai_segments_field_catalog.sql
-- Reformula o catálogo de "campos obrigatórios" por segmento a partir de
-- uma lista curada pelo usuário. Substitui default_required_fields de cada
-- segmento (nomes exatos, não ILIKE — o seed original usava ILIKE e corria
-- risco de colisão por substring, ex. "Estética" casando com "Estética
-- Automotiva"; agora usamos o nome exato de cada linha).
-- Chaves novas correspondentes em src/lib/field-labels.ts (deploy do código
-- tem que acompanhar esta migration — os labels vêm de lá, não do banco).
-- Seguro para produção: só reescreve um array jsonb já existente.
-- ============================================================

update public.ai_segments set default_required_fields =
  '["area_interesse","objetivo_principal","primeira_vez_ou_paciente","restricoes_saude"]'::jsonb
  where name = 'Clínica de Estética';

update public.ai_segments set default_required_fields =
  '["especialidade","primeira_vez_ou_retorno","convenio_ou_particular","emergencia_ou_eletivo","tem_pedido_medico"]'::jsonb
  where name = 'Consultório Médico';

update public.ai_segments set default_required_fields =
  '["descricao_problema","primeira_vez_ou_retorno","convenio_ou_particular","emergencia_ou_eletivo"]'::jsonb
  where name = 'Odontologia';

update public.ai_segments set default_required_fields =
  '["tem_pedido_medico","exames_desejados","convenio_ou_particular","primeira_vez_ou_paciente","urgencia_resultado"]'::jsonb
  where name = 'Laboratório de Análises';

update public.ai_segments set default_required_fields =
  '["servico_desejado","ja_e_cliente","quimica_cabelo","restricoes_saude"]'::jsonb
  where name = 'Salão de Beleza';

update public.ai_segments set default_required_fields =
  '["servico_desejado","ja_e_cliente","referencia_estilo"]'::jsonb
  where name = 'Barbearia';

update public.ai_segments set default_required_fields =
  '["placa","marca","modelo","ano","descricao_problema","tipo_veiculo"]'::jsonb
  where name = 'Oficina Mecânica';

update public.ai_segments set default_required_fields =
  '["tipo_veiculo","porte_veiculo","servico_desejado","estado_atual_veiculo"]'::jsonb
  where name = 'Lava-rápido e Estética Automotiva';

update public.ai_segments set default_required_fields =
  '["objetivo","nivel_experiencia","restricoes_saude","preferencia_treino"]'::jsonb
  where name = 'Academia e Personal';

update public.ai_segments set default_required_fields =
  '["queixa_principal","tem_pedido_medico","primeira_vez_ou_retorno","convenio_ou_particular"]'::jsonb
  where name = 'Clínica de Fisioterapia';

update public.ai_segments set default_required_fields =
  '["tipo_aparelho","marca","modelo","descricao_problema","em_garantia"]'::jsonb
  where name = 'Assistência Técnica';

update public.ai_segments set default_required_fields =
  '["nome_animal","especie","raca","idade","peso","descricao_problema"]'::jsonb
  where name = 'Clínica Veterinária';

update public.ai_segments set default_required_fields =
  '["objetivo_principal","primeira_vez_ou_retorno","restricao_alimentar","convenio_ou_particular"]'::jsonb
  where name = 'Nutrição e Dietética';

update public.ai_segments set default_required_fields =
  '["primeira_vez_ou_retorno","motivo_ou_sessao","modalidade_atendimento","convenio_ou_particular"]'::jsonb
  where name = 'Psicologia e Terapia';

update public.ai_segments set default_required_fields =
  '["area_do_direito","objetivo_principal","processo_em_andamento","descricao_problema"]'::jsonb
  where name = 'Advocacia e Jurídico';

-- Sem sugestão coerente possível pra um segmento genérico — fica só com
-- perguntas personalizadas (a tela já trata lista vazia com uma mensagem
-- explicativa, não aparenta estar quebrada).
update public.ai_segments set default_required_fields = '[]'::jsonb
  where name = 'Outro / Personalizado';

-- Defensivo: nenhum tenant deveria ter "problema" persistido em
-- profiles.ai_required_fields ainda (a UI de override só foi ao ar há
-- minutos), mas por segurança troca pra "descricao_problema" se existir.
update public.profiles
set ai_required_fields = (
  select jsonb_agg(case when elem = '"problema"' then '"descricao_problema"'::jsonb else elem end)
  from jsonb_array_elements(ai_required_fields) as elem
)
where ai_required_fields @> '["problema"]'::jsonb;
