-- ════════════════════════════════════════════════════════════
-- AI AGENT: configuração global, segmentos, onboarding, logs
-- Aditivo. Não altera RLS de tabelas existentes.
-- ════════════════════════════════════════════════════════════

-- 1) global_settings (key/value)
create table if not exists public.global_settings (
  key text primary key,
  value text,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.global_settings enable row level security;

drop policy if exists "anyone read global_settings" on public.global_settings;
drop policy if exists "super admin write global_settings" on public.global_settings;
-- Leitura: apenas super admin (gemini_api_key NUNCA pode vazar)
create policy "super admin read global_settings"
  on public.global_settings for select to authenticated
  using (public.is_super_admin());
create policy "super admin write global_settings"
  on public.global_settings for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Seeds
insert into public.global_settings (key, value, description) values
  ('gemini_api_key',     '',                 'Chave da API Google Gemini'),
  ('gemini_model',       'gemini-1.5-flash', 'Modelo Gemini padrão'),
  ('gemini_temperature', '0.7',              'Temperatura 0.0-1.0'),
  ('gemini_max_tokens',  '1000',             'Máximo de tokens por resposta'),
  ('ai_base_prompt',
'Você é um assistente virtual de atendimento ao cliente brasileiro.
Responda sempre em português brasileiro informal e cordial.
Seja objetivo e simpático. Nunca invente informações.
Se não souber algo, diga que vai verificar com a equipe.
Seu objetivo principal é entender a necessidade do cliente e agendar um horário quando apropriado.
Nunca mencione que é uma IA a menos que o cliente pergunte diretamente.
Quando o cliente usar palavras de transferência definidas, diga que vai passar para um atendente.',
   'Prompt base universal para todos os workspaces')
on conflict (key) do nothing;

-- 2) ai_segments
create table if not exists public.ai_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  icon text default '🏢',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  segment_prompt text not null default '',
  default_assistant_name text default 'Sofia',
  default_tone text default 'Amigável',
  default_transfer_keywords text[] default array['humano','atendente','reclamação']::text[],
  default_transfer_after_messages integer default 5,
  suggested_services jsonb not null default '[]'::jsonb,
  triage_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_segments enable row level security;
drop policy if exists "read active segments" on public.ai_segments;
drop policy if exists "super admin all segments" on public.ai_segments;
create policy "read active segments"
  on public.ai_segments for select to authenticated
  using (is_active = true or public.is_super_admin());
create policy "super admin all segments"
  on public.ai_segments for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 3) Colunas em profiles (idempotente)
alter table public.profiles
  add column if not exists segment_id uuid references public.ai_segments(id) on delete set null,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists business_name text,
  add column if not exists business_description text,
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_assistant_name text default 'Sofia',
  add column if not exists ai_tone text default 'Amigável',
  add column if not exists ai_custom_prompt text,
  add column if not exists ai_transfer_keywords text[] default array['humano','atendente','reclamação']::text[],
  add column if not exists ai_transfer_after_messages integer default 5,
  add column if not exists ai_schedule_enabled boolean not null default false,
  add column if not exists ai_schedule_instruction text,
  add column if not exists ai_working_hours jsonb default '{
    "monday":    {"enabled": true,  "start": "08:00", "end": "20:00"},
    "tuesday":   {"enabled": true,  "start": "08:00", "end": "20:00"},
    "wednesday": {"enabled": true,  "start": "08:00", "end": "20:00"},
    "thursday":  {"enabled": true,  "start": "08:00", "end": "20:00"},
    "friday":    {"enabled": true,  "start": "08:00", "end": "20:00"},
    "saturday":  {"enabled": true,  "start": "08:00", "end": "20:00"},
    "sunday":    {"enabled": false, "start": "08:00", "end": "20:00"}
  }'::jsonb,
  add column if not exists ai_out_of_hours_message text
    default 'Olá! No momento estamos fora do horário de atendimento. Retornaremos a partir das 8h.';

-- 4) ai_usage_logs
create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  segment_id uuid references public.ai_segments(id) on delete set null,
  contact_id uuid,
  action text not null,                -- send_message | transfer_to_human | send_out_of_hours | error
  tokens_input integer default 0,
  tokens_output integer default 0,
  tokens_total integer default 0,
  cost_estimate_cents integer default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_workspace_idx
  on public.ai_usage_logs (workspace_owner_id, created_at desc);
create index if not exists ai_usage_created_idx
  on public.ai_usage_logs (created_at desc);

alter table public.ai_usage_logs enable row level security;
drop policy if exists "owner read own ai usage" on public.ai_usage_logs;
drop policy if exists "super admin read all ai usage" on public.ai_usage_logs;
create policy "owner read own ai usage"
  on public.ai_usage_logs for select to authenticated
  using (workspace_owner_id = auth.uid() or public.is_super_admin());

-- 5) Função pública de segmentos para onboarding (sem expor prompt completo se quiser; aqui devolve tudo)
-- segmentos ativos já visíveis pela RLS acima.

-- 6) Seeds dos segmentos (só insere se slug não existir)
insert into public.ai_segments
(name, slug, description, icon, sort_order, segment_prompt, default_assistant_name, suggested_services, default_transfer_keywords)
values
('Clínica de Estética','clinica_estetica','Clínicas de estética, harmonização facial, tratamentos corporais','💆',1,
'Você atende uma clínica de estética. Conheça os serviços mais comuns: limpeza de pele, hidratação facial, peeling, microagulhamento, harmonização facial, preenchimento labial, botox, radiofrequência, drenagem linfática, massagem relaxante.
Ao atender, pergunte qual área de interesse (rosto ou corpo) e se é a primeira vez na clínica.
Explique que alguns procedimentos exigem avaliação prévia gratuita antes de agendar.
Nunca prometa resultados específicos — diga que os resultados variam por pessoa.
Informe que alguns procedimentos têm contraindicações (gravidez, uso de medicamentos) e que a avaliação esclarece isso.',
'Sofia',
'[{"name":"Limpeza de Pele","duration_minutes":60,"price_cents":15000},{"name":"Hidratação Facial","duration_minutes":45,"price_cents":12000},{"name":"Harmonização Facial","duration_minutes":90,"price_cents":80000},{"name":"Drenagem Linfática","duration_minutes":60,"price_cents":18000},{"name":"Massagem Relaxante","duration_minutes":60,"price_cents":16000}]'::jsonb,
array['humano','atendente','reclamação','urgente','alérgico']),

('Consultório Médico','consultorio_medico','Clínicas gerais, especialidades médicas, consultórios particulares','🩺',2,
'Você atende um consultório médico. Seja especialmente empático e cuidadoso.
Nunca dê diagnósticos, prescreva medicamentos ou dê orientações médicas específicas.
Se o paciente descrever sintomas graves (dor no peito, dificuldade respiratória, desmaio), oriente imediatamente a procurar pronto-socorro ou ligar 192 (SAMU).
Sua função é: agendar consultas, informar sobre especialidades disponíveis, confirmar horários e orientar sobre documentos necessários (plano de saúde, exames anteriores).
Pergunte sempre se é consulta de retorno ou primeira vez.',
'Ana',
'[{"name":"Consulta Médica","duration_minutes":30,"price_cents":25000},{"name":"Consulta de Retorno","duration_minutes":20,"price_cents":15000},{"name":"Check-up Completo","duration_minutes":60,"price_cents":45000}]'::jsonb,
array['urgente','emergência','pronto-socorro','não consigo respirar','dor forte','humano','médico']),

('Odontologia','odontologia','Consultórios e clínicas odontológicas','🦷',3,
'Você atende um consultório odontológico. Seja acolhedor — muitas pessoas têm ansiedade com dentista.
Serviços comuns: limpeza e profilaxia, restauração, extração, clareamento dental, aparelho ortodôntico, implante, prótese, tratamento de canal, periodontia.
Pergunte se é emergência (dor aguda, dente quebrado, inchaço) — nesses casos, priorize encaixe o mais rápido possível.
Para implante e aparelho, explique que é necessária uma avaliação inicial sem compromisso.
Informe que aceitam pacientes com ansiedade e que trabalham com técnicas de conforto.',
'Júlia',
'[{"name":"Limpeza e Profilaxia","duration_minutes":45,"price_cents":18000},{"name":"Restauração","duration_minutes":60,"price_cents":25000},{"name":"Clareamento Dental","duration_minutes":90,"price_cents":120000},{"name":"Avaliação de Implante","duration_minutes":30,"price_cents":0},{"name":"Tratamento de Canal","duration_minutes":90,"price_cents":80000}]'::jsonb,
array['dor','emergência','humano','dentista','urgente']),

('Laboratório de Análises','laboratorio','Laboratórios de exames clínicos e análises','🔬',4,
'Você atende um laboratório de análises clínicas. Seja preciso e informativo.
Função principal: informar sobre preparo de exames (jejum, medicamentos que interferem), agendar coleta, informar prazos.
IMPORTANTE: Nunca interprete resultados de exames. Diga sempre que a interpretação deve ser feita pelo médico solicitante.
Pergunte sempre se tem pedido médico e se vai usar convênio ou particular.',
'Carla',
'[{"name":"Coleta de Sangue","duration_minutes":15,"price_cents":5000},{"name":"Exame de Urina","duration_minutes":10,"price_cents":3000},{"name":"Check-up Laboratorial","duration_minutes":20,"price_cents":18000}]'::jsonb,
array['resultado','urgente','humano','atendente']),

('Salão de Beleza','salao_beleza','Salões de cabeleireiro, manicure, pedicure, sobrancelhas','💇',5,
'Você atende um salão de beleza. Seja descontraído e fashion.
Ao agendar coloração ou alisamento, avise que o tempo pode variar (2-4 horas) e pergunte sobre o estado do cabelo (virgem, colorido, com química).
Para micropigmentação e alongamento de cílios, avise que é necessária avaliação do estado atual.',
'Bela',
'[{"name":"Corte Feminino","duration_minutes":60,"price_cents":8000},{"name":"Coloração","duration_minutes":180,"price_cents":22000},{"name":"Manicure e Pedicure","duration_minutes":90,"price_cents":9000},{"name":"Escova Progressiva","duration_minutes":180,"price_cents":35000},{"name":"Design de Sobrancelhas","duration_minutes":30,"price_cents":4500}]'::jsonb,
array['reclamação','humano','urgente']),

('Barbearia','barbearia','Barbearias e salões masculinos','💈',6,
'Você atende uma barbearia. Seja direto e descontraído — público majoritariamente masculino.
Pergunte se prefere atendente específico (muitos clientes têm barbeiro preferido).
Tempos típicos: corte simples 30min, corte + barba 60min.',
'Max',
'[{"name":"Corte Masculino","duration_minutes":30,"price_cents":5000},{"name":"Barba Completa","duration_minutes":30,"price_cents":4500},{"name":"Corte + Barba","duration_minutes":60,"price_cents":8500},{"name":"Pigmentação de Barba","duration_minutes":45,"price_cents":7000}]'::jsonb,
array['humano','barbeiro','reclamação']),

('Oficina Mecânica','oficina_mecanica','Oficinas mecânicas, elétricas e multimarcas','🔧',7,
'Você atende uma oficina mecânica. Seja técnico mas acessível.
Sempre confirme placa, marca, modelo e ano antes de sugerir serviços.
Para orçamentos: colete placa e descreva o problema — informe que o valor pode variar após inspeção.
Se o carro estiver parado em pane, pergunte se precisa de guincho antes de agendar.',
'Carlos',
'[{"name":"Revisão Geral","duration_minutes":120,"price_cents":35000},{"name":"Troca de Óleo","duration_minutes":30,"price_cents":8900},{"name":"Alinhamento e Balanceamento","duration_minutes":60,"price_cents":12900},{"name":"Diagnóstico Elétrico","duration_minutes":60,"price_cents":15000},{"name":"Troca de Pastilhas","duration_minutes":60,"price_cents":24500}]'::jsonb,
array['urgente','guincho','humano','mecânico','reclamação']),

('Lava-rápido e Estética Automotiva','estetica_automotiva','Lava-rápidos, polimento, vitrificação, higienização','🚗',8,
'Você atende um lava-rápido ou estética automotiva. Seja ágil e objetivo.
Pergunte tipo e porte do veículo (hatch, sedan, SUV, caminhonete) pois impacta no preço e tempo.
Para polimento e vitrificação, avise que é necessário agendar com antecedência pois levam o dia todo.',
'Rafael',
'[{"name":"Lavagem Simples","duration_minutes":30,"price_cents":5000},{"name":"Lavagem Completa","duration_minutes":60,"price_cents":9000},{"name":"Polimento","duration_minutes":480,"price_cents":45000},{"name":"Vitrificação","duration_minutes":480,"price_cents":120000}]'::jsonb,
array['humano','reclamação','urgente']),

('Academia e Personal','academia_personal','Academias, studios de pilates, personal trainers','💪',9,
'Você atende uma academia, studio de pilates ou personal trainer. Seja motivador e enérgico.
Pergunte o objetivo (emagrecer, ganhar massa, condicionamento, reabilitação) e nível de experiência.
Para pilates com aparelho e personal, avise que vagas são limitadas.
Informe sobre possibilidade de aula experimental.',
'Letícia',
'[{"name":"Aula Experimental","duration_minutes":60,"price_cents":0},{"name":"Pilates com Aparelho","duration_minutes":55,"price_cents":12000},{"name":"Avaliação Física","duration_minutes":60,"price_cents":8000},{"name":"Personal Training","duration_minutes":60,"price_cents":18000}]'::jsonb,
array['lesão','dor','humano','cancelar']),

('Clínica de Fisioterapia','fisioterapia','Clínicas de fisioterapia, RPG, pilates clínico','🏃',10,
'Você atende uma clínica de fisioterapia. Seja acolhedor e profissional.
Pergunte sobre a queixa principal (dor nas costas, pós-operatório, lesão esportiva, neurológico, respiratório).
Informe que a primeira sessão é uma avaliação para montar o plano de tratamento.
Nunca dê diagnóstico. Se a dor for aguda e intensa, oriente consulta médica antes.',
'Dra. Paula',
'[{"name":"Avaliação Fisioterapêutica","duration_minutes":60,"price_cents":20000},{"name":"Sessão de Fisioterapia","duration_minutes":50,"price_cents":18000},{"name":"RPG","duration_minutes":50,"price_cents":22000},{"name":"Pilates Clínico","duration_minutes":55,"price_cents":20000}]'::jsonb,
array['emergência','urgente','humano','fisioterapeuta']),

('Assistência Técnica','assistencia_tecnica','Assistência técnica de eletrônicos, celulares, eletrodomésticos','📱',11,
'Você atende uma assistência técnica. Seja técnico e direto.
Pergunte: tipo de aparelho, marca, modelo, problema relatado e se ainda está na garantia.
Informe que o orçamento é feito após diagnóstico técnico (1-3 dias úteis).
Avise que alguns reparos podem não ter solução e que o diagnóstico pode ter custo separado.',
'Técnico João',
'[{"name":"Diagnóstico Técnico","duration_minutes":60,"price_cents":5000},{"name":"Troca de Tela","duration_minutes":60,"price_cents":35000},{"name":"Troca de Bateria","duration_minutes":30,"price_cents":12000}]'::jsonb,
array['urgente','reclamação','humano','técnico']),

('Clínica Veterinária','veterinaria','Clínicas veterinárias, pet shops com serviços, banho e tosa','🐾',12,
'Você atende uma clínica veterinária. Seja carinhoso — os tutores amam seus pets.
Pergunte sempre: nome do animal, espécie, raça, idade e peso.
Para emergências (vômito com sangue, convulsão, atropelamento, dificuldade respiratória), oriente atendimento IMEDIATO.
Para banho e tosa, pergunte porte do animal pois determina o preço.',
'Dra. Camila',
'[{"name":"Consulta Veterinária","duration_minutes":30,"price_cents":18000},{"name":"Vacinação","duration_minutes":20,"price_cents":12000},{"name":"Banho e Tosa Pequeno Porte","duration_minutes":120,"price_cents":8000},{"name":"Banho e Tosa Grande Porte","duration_minutes":180,"price_cents":15000},{"name":"Castração","duration_minutes":120,"price_cents":55000}]'::jsonb,
array['emergência','urgente','humano','veterinário','sangue','convulsão']),

('Nutrição e Dietética','nutricao','Consultórios de nutrição, nutrólogos, coaches alimentares','🥗',13,
'Você atende um consultório de nutrição. Seja encorajador e sem julgamentos.
Nunca sugira dietas, restrições alimentares ou suplementos — isso é papel do nutricionista.
Pergunte o objetivo principal: emagrecimento, ganho de massa, saúde geral, alimentação infantil, pré/pós operatório, doenças específicas.
Informe que a primeira consulta inclui avaliação completa e montagem do plano alimentar.',
'Dra. Ana',
'[{"name":"Consulta Inicial de Nutrição","duration_minutes":60,"price_cents":28000},{"name":"Consulta de Retorno","duration_minutes":30,"price_cents":18000},{"name":"Bioimpedância","duration_minutes":20,"price_cents":8000}]'::jsonb,
array['urgente','humano','nutricionista']),

('Psicologia e Terapia','psicologia','Consultórios de psicologia, terapia, psicanálise','🧠',14,
'Você atende um consultório de psicologia. Seja extremamente acolhedor e sem julgamentos.
ATENÇÃO ESPECIAL: Se o cliente mencionar pensamentos suicidas, autolesão ou crise aguda, responda com empatia, valide os sentimentos e oriente o CVV (188) além de priorizar atendimento urgente.
Nunca minimize sofrimento emocional.
Sua função é agendar sessões — não faça perguntas clínicas detalhadas no WhatsApp.
A confidencialidade é total — não compartilhe dados de clientes.',
'Dra. Laura',
'[{"name":"Sessão de Psicoterapia","duration_minutes":50,"price_cents":25000},{"name":"Avaliação Psicológica","duration_minutes":60,"price_cents":35000},{"name":"Terapia Online","duration_minutes":50,"price_cents":22000}]'::jsonb,
array['crise','urgente','suicídio','humano','psicóloga','emergência']),

('Advocacia e Jurídico','advocacia','Escritórios de advocacia, assessoria jurídica','⚖️',15,
'Você atende um escritório de advocacia. Seja formal e preciso.
NUNCA dê aconselhamento jurídico, opiniões sobre casos ou previsões de resultado.
Sua função: agendar consultas iniciais, informar sobre as áreas de atuação do escritório.
Pergunte qual área de direito envolve a situação para direcionar ao advogado correto.',
'Dr. Roberto',
'[{"name":"Consulta Inicial","duration_minutes":60,"price_cents":35000},{"name":"Consulta de Retorno","duration_minutes":30,"price_cents":20000}]'::jsonb,
array['urgente','humano','advogado','reclamação']),

('Outro / Personalizado','personalizado','Segmento genérico para negócios não listados','🏢',99,
'Você atende um negócio de prestação de serviços. Seja cordial e profissional.
Sua função é atender os clientes, entender suas necessidades e agendar horários quando apropriado.
Siga as instruções personalizadas configuradas pelo estabelecimento.',
'Sofia','[]'::jsonb,
array['humano','atendente','reclamação','urgente'])
on conflict (slug) do nothing;
