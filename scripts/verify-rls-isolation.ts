/**
 * Teste de isolamento entre empresas (RLS).
 *
 * Por que isto é um script à parte, e não um teste em src/lib/__tests__/: os
 * testes existentes mockam `supabaseAdmin` inteiro — nunca tocam Postgres de
 * verdade, então nunca exercitam RLS de verdade. RLS só é testável com uma
 * sessão autenticada de verdade contra o banco de verdade. Este script faz
 * isso: cria dois workspaces efêmeros com um usuário dono cada, mais um
 * agente sem atribuição num deles, autentica como cada um via senha real
 * (client anon, não service role), e tenta especificamente o que RLS existe
 * para impedir — ler/gravar dado do outro workspace, ou dado do próprio
 * workspace fora do escopo do papel.
 *
 * Roda contra o banco de PRODUÇÃO (não há outro). Por isso:
 * - todo dado de teste é marcado com um prefixo único e datado, nunca colide
 *   com dado real;
 * - nenhuma chamada toca a Evolution API (inserts diretos nas tabelas, não
 *   os server fns de envio) — zero mensagem sai para qualquer WhatsApp real;
 * - limpeza roda em `finally`, e o script confirma ao final que não sobrou
 *   nenhuma linha com os ids de teste, mesmo se alguma asserção falhar no meio.
 *
 * Rodar com: npx tsx --env-file=.env scripts/verify-rls-isolation.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Faltam env vars. Rode com: npx tsx --env-file=.env scripts/verify-rls-isolation.ts");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

const TAG = `rls-test-${Date.now()}`;
const PASSWORD = `Rls-Test-${Date.now()}-!Aa1`;

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Client autenticado como um usuário real, via login por senha (não service role). */
async function signInAs(email: string, password: string) {
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login falhou para ${email}: ${error?.message}`);
  return client;
}

async function createTestOwner(label: string) {
  const email = `${TAG}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`criar usuário ${label} falhou: ${error?.message}`);
  return { id: data.user.id, email };
}

async function main() {
  console.log(`\n=== Teste de isolamento RLS — tag ${TAG} ===\n`);

  // ---- Setup: dois workspaces (dono A, dono B) + um agente dentro de A ----
  const ownerA = await createTestOwner("owner-a");
  const ownerB = await createTestOwner("owner-b");
  const agentA = await createTestOwner("agent-a");

  // O trigger de signup torna TODO usuário novo dono do próprio workspace —
  // inclusive o "agente". Isso importa: get_my_workspace_owner() desempata
  // priorizando a linha em que o próprio usuário é dono (ver
  // 20260515000000_fix_roles_swap.sql:88, `case when workspace_owner_id =
  // auth.uid() then 0 else 1`), então enquanto essa linha existir, o agente
  // resolve para O PRÓPRIO workspace, nunca para o de A — mesmo depois de
  // "adicionado" a A. É exatamente por isso que `createTeamMember`
  // (team.functions.ts:157-160) apaga essa linha antes de inserir a real;
  // replicar aqui, senão o teste mede um estado que a aplicação nunca produz.
  await admin.from("workspace_members").delete().eq("member_user_id", agentA.id);
  const { error: memberErr } = await admin
    .from("workspace_members")
    .insert({ workspace_owner_id: ownerA.id, member_user_id: agentA.id, active: true });
  if (memberErr) throw new Error(`vincular agente a workspace A falhou: ${memberErr.message}`);
  await admin.from("user_roles").delete().eq("user_id", agentA.id);
  await admin.from("user_roles").insert({ user_id: agentA.id, role: "agent" });

  // Um contato exclusivo de cada workspace, mais um segundo contato em A para
  // testar visibilidade por atribuição (o agente NÃO está atribuído a nenhum).
  const mkContact = async (owner: string, name: string) => {
    const { data, error } = await admin
      .from("contacts")
      .insert({
        owner_user_id: owner,
        phone: `+55000${Math.floor(Math.random() * 1e7)}`,
        name,
        kanban_column: "waiting",
        is_unread: false,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`criar contato ${name} falhou: ${error?.message}`);
    return data.id as string;
  };

  const contactA = await mkContact(ownerA.id, `${TAG}-contact-A`);
  const contactB = await mkContact(ownerB.id, `${TAG}-contact-B`);

  const mkMessage = async (owner: string, contactId: string, content: string) => {
    const { error } = await admin.from("messages").insert({
      owner_user_id: owner,
      contact_id: contactId,
      direction: "inbound",
      content,
      message_type: "text",
      status: "sent",
    });
    if (error) throw new Error(`criar mensagem falhou: ${error.message}`);
  };
  await mkMessage(ownerA.id, contactA, `${TAG} segredo do workspace A`);
  await mkMessage(ownerB.id, contactB, `${TAG} segredo do workspace B`);

  try {
    // ---- Sessões reais, uma por papel ----
    const asOwnerA = await signInAs(ownerA.email, PASSWORD);
    const asOwnerB = await signInAs(ownerB.email, PASSWORD);
    const asAgentA = await signInAs(agentA.email, PASSWORD);

    // 1) Dono de A não enxerga NADA do workspace B, mesmo com o id exato.
    const r1 = await asOwnerA.from("contacts").select("id").eq("id", contactB);
    record(
      "dono de A não lê contato de B por id direto",
      !r1.error && (r1.data?.length ?? 0) === 0,
      r1.error?.message ?? `${r1.data?.length ?? 0} linha(s) retornada(s)`,
    );

    // 2) Listagem geral de A nunca inclui o contato de B.
    const r2 = await asOwnerA.from("contacts").select("id");
    const vazouParaLista = (r2.data ?? []).some((c: any) => c.id === contactB);
    record("listagem de contatos de A não inclui contato de B", !vazouParaLista);

    // 3) Dono de A não lê mensagem de B, mesmo sabendo o contact_id.
    const r3 = await asOwnerA.from("messages").select("id,content").eq("contact_id", contactB);
    record(
      "dono de A não lê mensagens do contato de B",
      !r3.error && (r3.data?.length ?? 0) === 0,
      r3.error?.message ?? `${r3.data?.length ?? 0} linha(s) retornada(s)`,
    );

    // 4) Dono de A não consegue ATUALIZAR o contato de B (nem de propósito).
    const r4 = await asOwnerA.from("contacts").update({ name: "hackeado" }).eq("id", contactB).select("id");
    record(
      "dono de A não consegue alterar contato de B",
      !r4.error && (r4.data?.length ?? 0) === 0,
      r4.error ? r4.error.message : `${r4.data?.length ?? 0} linha(s) afetada(s)`,
    );

    // 5) Dono de A não consegue INSERIR mensagem no contato de B (spoofing).
    const r5 = await asOwnerA
      .from("messages")
      .insert({
        owner_user_id: ownerB.id,
        contact_id: contactB,
        direction: "outbound",
        content: `${TAG} injetado por A`,
        message_type: "text",
        status: "sent",
      })
      .select("id");
    record(
      "dono de A não consegue inserir mensagem no workspace de B",
      !!r5.error,
      r5.error?.message ?? "insert foi aceito — VAZAMENTO",
    );

    // 6) Reciprocidade: dono de B também não vê nada de A.
    const r6 = await asOwnerB.from("contacts").select("id").eq("id", contactA);
    record(
      "dono de B não lê contato de A (reciprocidade)",
      !r6.error && (r6.data?.length ?? 0) === 0,
      r6.error?.message ?? `${r6.data?.length ?? 0} linha(s) retornada(s)`,
    );

    // 7) Agente DENTRO do workspace A, mas sem atribuição, não vê o contato de A.
    const r7 = await asAgentA.from("contacts").select("id").eq("id", contactA);
    record(
      "agente sem atribuição não vê contato do próprio workspace",
      !r7.error && (r7.data?.length ?? 0) === 0,
      r7.error?.message ?? `${r7.data?.length ?? 0} linha(s) retornada(s)`,
    );

    // 8) Atribuindo o contato ao agente, ele passa a ver — prova que o filtro é
    //    por atribuição e não um bloqueio geral quebrado.
    await admin.from("contacts").update({ assigned_agent_id: agentA.id }).eq("id", contactA);
    const r8 = await asAgentA.from("contacts").select("id").eq("id", contactA);
    record(
      "agente COM atribuição vê o próprio contato",
      !r8.error && (r8.data?.length ?? 0) === 1,
      r8.error?.message ?? `${r8.data?.length ?? 0} linha(s) retornada(s)`,
    );

    // 9) Mesmo atribuído em A, o agente segue sem ver nada de B.
    const r9 = await asAgentA.from("contacts").select("id").eq("id", contactB);
    record(
      "agente de A não vê contato de B mesmo estando atribuído em A",
      !r9.error && (r9.data?.length ?? 0) === 0,
      r9.error?.message ?? `${r9.data?.length ?? 0} linha(s) retornada(s)`,
    );
  } finally {
    // ---- Limpeza: sempre, mesmo se alguma asserção acima falhou ----
    console.log("\n--- limpando dados de teste ---");
    await admin.from("messages").delete().eq("contact_id", contactA);
    await admin.from("messages").delete().eq("contact_id", contactB);
    await admin.from("contacts").delete().eq("id", contactA);
    await admin.from("contacts").delete().eq("id", contactB);
    await admin.from("workspace_members").delete().eq("member_user_id", agentA.id);
    for (const u of [ownerA, ownerB, agentA]) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) console.warn(`  aviso: falha ao apagar usuário de teste ${u.email}: ${error.message}`);
    }

    // Confirma que não sobrou nada com os ids de teste, mesmo que algum passo
    // de limpeza acima tenha falhado silenciosamente.
    const residual = await admin
      .from("contacts")
      .select("id")
      .in("id", [contactA, contactB]);
    record(
      "limpeza: nenhum contato de teste restante",
      !residual.error && (residual.data?.length ?? 0) === 0,
      residual.error?.message ?? `${residual.data?.length ?? 0} linha(s) residual(is)`,
    );
    const residualMembers = await admin
      .from("workspace_members")
      .select("id")
      .in("member_user_id", [ownerA.id, ownerB.id, agentA.id]);
    record(
      "limpeza: nenhuma linha de workspace_members restante",
      !residualMembers.error && (residualMembers.data?.length ?? 0) === 0,
      residualMembers.error?.message ?? `${residualMembers.data?.length ?? 0} linha(s) residual(is)`,
    );
  }

  console.log("\n=== Resumo ===");
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  console.log(`\n${results.length - failed.length}/${results.length} passaram.`);
  if (failed.length > 0) {
    console.error(`\n${failed.length} falha(s) — possível vazamento entre empresas. Investigar antes de deploy.`);
    process.exit(1);
  }
  console.log("\nIsolamento entre empresas OK.");
}

main().catch((e) => {
  console.error("\nErro fatal no teste de isolamento:", e?.message ?? e);
  process.exit(1);
});
