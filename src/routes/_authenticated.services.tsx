import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Pencil, Archive, X, Check } from "lucide-react";
import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import {
  type Category,
  type Service,
  type ServiceStatus,
  PRESET_COLORS,
  PRESET_EMOJIS,
  SEED_CATEGORIES,
  SEED_SERVICES,
  STATUS_COLOR,
  STATUS_LABEL,
  formatCurrencyBRL,
  formatCurrencyInput,
  formatDuration,
  parseCurrencyToCents,
} from "@/features/services/data";

import { ManagerOnly } from "@/components/manager-only";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";

export const Route = createFileRoute("/_authenticated/services")({
  component: () => (
    <ManagerOnly>
      <ServicesPage />
    </ManagerOnly>
  ),
});

type Editing =
  | { mode: "create" }
  | { mode: "edit"; service: Service }
  | null;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ServicesPage() {
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const [categories, setCategories] = React.useState<Category[]>(SEED_CATEGORIES);
  const [services, setServices] = React.useState<Service[]>(SEED_SERVICES);
  
  const [activeCat, setActiveCat] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<Editing>(null);

  // Cmd+K → "Novo serviço"
  React.useEffect(() => {
    const onNew = () => setEditing({ mode: "create" });
    window.addEventListener("zf:new-service", onNew);
    return () => window.removeEventListener("zf:new-service", onNew);
  }, []);

  // Hidrata do supabase. Só quando o workspaceOwnerId está disponível para
  // garantir que filtramos pelos dados do dono certo.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;
    (async () => {
      const [{ data: cats }, { data: svc, error: svcErr }] = await Promise.all([
        supabase
          .from("service_categories")
          .select("id,name,color,owner_user_id")
          .or(`owner_user_id.is.null,owner_user_id.eq.${workspaceOwnerId}`)
          .order("created_at", { ascending: true }),
        supabase
          .from("services")
          .select(
            "id,category_id,name,description,price_cents,duration_minutes,emoji,color,status,created_at",
          )
          .eq("owner_user_id", workspaceOwnerId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (svcErr) {
        console.warn("[services] erro ao ler:", svcErr.message);
        notify.error(`Falha ao carregar serviços: ${svcErr.message}`);
      }
      if (cats && cats.length > 0) {
        setCategories(
          cats.map((c: any) => ({ id: c.id, name: c.name, color: c.color ?? "#25C880" })),
        );
      }
      // Substitui SEMPRE pelo que veio do banco (mesmo lista vazia) — assim
      // SEEDs locais não confundem o usuário fingindo que existem serviços.
      setServices(
        (svc ?? []).map((s: any) => ({
          id: s.id,
          category_id: s.category_id ?? "",
          name: s.name,
          description: s.description ?? "",
          price_cents: s.price_cents ?? 0,
          duration_minutes: s.duration_minutes ?? 30,
          emoji: s.emoji ?? "🔧",
          color: s.color ?? "#25C880",
          status: (s.status ?? "active") as ServiceStatus,
          created_at: s.created_at ? new Date(s.created_at) : new Date(),
        })),
      );
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceOwnerId]);

  const filtered = React.useMemo(() => {
    return services.filter((s) => {
      if (activeCat !== "all" && s.category_id !== activeCat) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.description.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, activeCat, query, hydrated]);

  const upsertService = async (draft: Service) => {
    if (!workspaceOwnerId) {
      notify.error("Carregando sua conta… tente novamente em instantes.");
      return;
    }
    const exists = services.some((s) => s.id === draft.id) && isUuid(draft.id);

    const payload: Record<string, unknown> = {
      owner_user_id: workspaceOwnerId,
      category_id: draft.category_id && isUuid(draft.category_id) ? draft.category_id : null,
      name: draft.name,
      description: draft.description,
      price_cents: draft.price_cents,
      duration_minutes: draft.duration_minutes,
      emoji: draft.emoji,
      color: draft.color,
      status: draft.status,
    };
    const query = exists
      ? supabase.from("services").update(payload).eq("id", draft.id).select("id,created_at").single()
      : supabase.from("services").insert(payload).select("id,created_at").single();
    const { data, error } = await query;
    if (error) {
      console.error("[services] falha ao salvar:", error);
      notify.error(`Não foi possível salvar: ${error.message}`);
      return;
    }
    const finalId = data?.id ?? draft.id;
    const created_at = data?.created_at ? new Date(data.created_at) : draft.created_at;
    setServices((prev) => {
      const without = prev.filter((s) => s.id !== draft.id && s.id !== finalId);
      return [...without, { ...draft, id: finalId, created_at }];
    });
    setEditing(null);
    notify.success(exists ? "Serviço atualizado." : "Serviço criado.");
  };

  const archiveService = async (id: string) => {
    if (!isUuid(id)) {
      // Item local (seed) — só remove da UI.
      setServices((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const { error } = await supabase
      .from("services")
      .update({ status: "inactive" })
      .eq("id", id);
    if (error) {
      console.error("[services] falha ao arquivar:", error);
      notify.error(`Não foi possível arquivar: ${error.message}`);
      return;
    }
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "inactive" as const } : s)),
    );
    notify.success("Serviço arquivado.");
  };

  const addCategory = async (name: string, color: string): Promise<Category> => {
    const tempId = `cat-${Date.now()}`;
    const { data, error } = await supabase
      .from("service_categories")
      .insert({ name, color, owner_user_id: workspaceOwnerId ?? undefined })
      .select("id")
      .single();
    if (error || !data?.id) {
      notify.error(`Não foi possível criar categoria: ${error?.message ?? "erro"}`);
      const cat: Category = { id: tempId, name, color };
      setCategories((prev) => [...prev, cat]);
      return cat;
    }
    const cat: Category = { id: data.id, name, color };
    setCategories((prev) => [...prev, cat]);
    return cat;
  };

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Serviços
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {services.length} serviço{services.length === 1 ? "" : "s"} em{" "}
            {categories.length} categoria{categories.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar serviço…"
              style={{
                width: 240,
                height: 32,
                padding: "0 10px 0 30px",
                fontSize: 13,
                color: "var(--text-primary)",
                background: "var(--bg-base)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                outline: "none",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setEditing({ mode: "create" })}
            className="btn-primary"
          >
            <Plus size={14} />
            Novo Serviço
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div
        className="flex flex-wrap items-center"
        style={{
          gap: 4,
          padding: 4,
          background: "var(--bg-overlay)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: "fit-content",
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        <CategoryPill
          active={activeCat === "all"}
          onClick={() => setActiveCat("all")}
          color="var(--text-muted)"
          count={counts.all}
        >
          Todos
        </CategoryPill>
        {categories.map((c) => (
          <CategoryPill
            key={c.id}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
            color={c.color}
            count={counts[c.id] ?? 0}
          >
            {c.name}
          </CategoryPill>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState onCreate={() => setEditing({ mode: "create" })} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              category={categories.find((c) => c.id === s.category_id)}
              onEdit={() => setEditing({ mode: "edit", service: s })}
              onArchive={() => archiveService(s.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ServiceModal
          initial={editing.mode === "edit" ? editing.service : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSubmit={upsertService}
          onAddCategory={addCategory}
        />
      )}
    </div>
  );
}

/* -------------- Service Card -------------- */

function ServiceCard({
  service,
  category,
  onEdit,
  onArchive,
}: {
  service: Service;
  category: Category | undefined;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const accent = category?.color ?? service.color;
  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        animation: "fadeSlideIn 200ms ease-out",
        transition: "border-color 150ms ease, transform 150ms ease",
      }}
    >
      {/* Status badge */}
      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          fontSize: 10,
          fontWeight: 500,
          padding: "2px 7px",
          borderRadius: 999,
          color: STATUS_COLOR[service.status],
          background: `color-mix(in oklab, ${STATUS_COLOR[service.status]} 12%, transparent)`,
          border: `1px solid color-mix(in oklab, ${STATUS_COLOR[service.status]} 30%, transparent)`,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {STATUS_LABEL[service.status]}
      </span>

      {/* Header */}
      <div className="flex items-start" style={{ gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `color-mix(in oklab, ${accent} 14%, var(--bg-overlay))`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {service.emoji}
        </div>
        <div className="min-w-0" style={{ paddingRight: 64 }}>
          <div
            className="truncate"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {service.name}
          </div>
          {category && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              {category.name}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border)" }} />

      {/* Meta */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        <Meta icon="⏱" label={formatDuration(service.duration_minutes)} />
        <Meta
          icon="💰"
          label={formatCurrencyBRL(service.price_cents)}
          valueStyle={{ fontWeight: 600, fontFamily: "var(--font-mono, ui-monospace)" }}
        />
        {service.description && (
          <Meta icon="📝" label={service.description} muted />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center" style={{ gap: 6, marginTop: 4 }}>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center justify-center"
          style={{
            flex: 1,
            gap: 4,
            height: 30,
            borderRadius: 6,
            border: "1px solid var(--border-strong)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Pencil size={12} />
          Editar
        </button>
        <button
          type="button"
          onClick={onArchive}
          className="inline-flex items-center justify-center"
          style={{
            flex: 1,
            gap: 4,
            height: 30,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Archive size={12} />
          Arquivar
        </button>
      </div>
    </div>
  );
}

function Meta({
  icon,
  label,
  muted,
  valueStyle,
}: {
  icon: string;
  label: string;
  muted?: boolean;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="flex items-start" style={{ gap: 6, fontSize: 12 }}>
      <span style={{ width: 16, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          color: muted ? "var(--text-muted)" : "var(--text-primary)",
          lineHeight: 1.4,
          ...valueStyle,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function CategoryPill({
  active,
  onClick,
  color,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center"
      style={{
        gap: 6,
        height: 28,
        padding: "0 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        background: active ? "var(--bg-surface)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        border: active ? "1px solid var(--border)" : "1px solid transparent",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
        }}
      />
      {children}
      <span
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          background: "var(--bg-overlay)",
          padding: "1px 5px",
          borderRadius: 999,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        padding: 48,
        border: "1px dashed var(--border-strong)",
        borderRadius: 12,
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>🛠️</div>
      <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
        Nenhum serviço encontrado
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        Comece criando seu primeiro serviço para o catálogo.
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary"
        style={{ marginTop: 16 }}
      >
        <Plus size={14} />
        Novo Serviço
      </button>
    </div>
  );
}

/* -------------- Modal -------------- */

function ServiceModal({
  initial,
  categories,
  onClose,
  onSubmit,
  onAddCategory,
}: {
  initial: Service | null;
  categories: Category[];
  onClose: () => void;
  onSubmit: (s: Service) => void;
  onAddCategory: (name: string, color: string) => Promise<Category>;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = React.useState(
    initial?.category_id ?? categories[0]?.id ?? "",
  );
  const [priceText, setPriceText] = React.useState(
    initial ? formatCurrencyInput(initial.price_cents) : "0,00",
  );
  const [durationValue, setDurationValue] = React.useState(() => {
    const m = initial?.duration_minutes ?? 30;
    return m % 60 === 0 && m >= 60 ? String(m / 60) : String(m);
  });
  const [durationUnit, setDurationUnit] = React.useState<"min" | "h">(() => {
    const m = initial?.duration_minutes ?? 30;
    return m % 60 === 0 && m >= 60 ? "h" : "min";
  });
  const [color, setColor] = React.useState(initial?.color ?? PRESET_COLORS[0]);
  const [emoji, setEmoji] = React.useState(initial?.emoji ?? "🔧");
  const [status, setStatus] = React.useState<ServiceStatus>(initial?.status ?? "active");
  const [showNewCat, setShowNewCat] = React.useState(false);
  const [newCatName, setNewCatName] = React.useState("");

  // Lock scroll
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onPriceChange = (v: string) => {
    const cents = parseCurrencyToCents(v);
    setPriceText(formatCurrencyInput(cents));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      notify.error("Nome do serviço é obrigatório.");
      return;
    }
    const cents = parseCurrencyToCents(priceText);
    const dur = Math.max(1, parseInt(durationValue, 10) || 0);
    const minutes = durationUnit === "h" ? dur * 60 : dur;

    const draft: Service = {
      id: initial?.id ?? `srv-${Date.now()}`,
      category_id: categoryId,
      name: name.trim(),
      description: description.trim(),
      price_cents: cents,
      duration_minutes: minutes,
      emoji,
      color,
      status,
      created_at: initial?.created_at ?? new Date(),
    };
    onSubmit(draft);
  };

  const createCategory = async () => {
    const n = newCatName.trim();
    if (!n) return;
    const c = await onAddCategory(n, color);
    setCategoryId(c.id);
    setNewCatName("");
    setShowNewCat(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeSlideIn 150ms ease-out",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100vh - 32px)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          animation: "fadeSlideIn 200ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {initial ? "Editar serviço" : "Novo serviço"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              Configure os detalhes que aparecerão no catálogo.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "transparent",
              color: "var(--text-muted)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          <div className="flex flex-col" style={{ gap: 12 }}>
            <ModalField label="Nome do serviço" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 100))}
                placeholder="Ex: Revisão de óleo"
                style={inputStyle}
                autoFocus
              />
            </ModalField>

            <ModalField label="Categoria">
              <div className="flex items-center" style={{ gap: 6 }}>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCat((v) => !v)}
                  style={{
                    height: 36,
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-strong)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Plus size={12} />
                  Nova
                </button>
              </div>
              {showNewCat && (
                <div className="flex items-center" style={{ gap: 6, marginTop: 6 }}>
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value.slice(0, 40))}
                    placeholder="Nome da categoria"
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createCategory();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={createCategory}
                    className="btn-primary"
                  >
                    <Check size={14} /> Criar
                  </button>
                </div>
              )}
            </ModalField>

            <ModalField label="Descrição">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="O que está incluso neste serviço?"
                rows={3}
                style={{
                  ...inputStyle,
                  height: "auto",
                  resize: "vertical",
                  padding: "8px 10px",
                  lineHeight: 1.4,
                }}
              />
            </ModalField>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <ModalField label="Preço">
                <div className="flex items-center" style={{ ...inputStyle, padding: 0, gap: 0 }}>
                  <span
                    style={{
                      paddingLeft: 10,
                      fontSize: 13,
                      color: "var(--text-muted)",
                    }}
                  >
                    R$
                  </span>
                  <input
                    value={priceText}
                    onChange={(e) => onPriceChange(e.target.value)}
                    inputMode="numeric"
                    style={{
                      flex: 1,
                      height: 34,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      padding: "0 10px",
                      fontFamily: "var(--font-mono, ui-monospace)",
                      textAlign: "right",
                    }}
                  />
                </div>
              </ModalField>

              <ModalField label="Tempo estimado">
                <div className="flex items-center" style={{ gap: 6 }}>
                  <input
                    value={durationValue}
                    onChange={(e) =>
                      setDurationValue(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    inputMode="numeric"
                    style={{ ...inputStyle, flex: 1, textAlign: "right" }}
                  />
                  <select
                    value={durationUnit}
                    onChange={(e) => setDurationUnit(e.target.value as "min" | "h")}
                    style={{ ...inputStyle, width: 90 }}
                  >
                    <option value="min">minutos</option>
                    <option value="h">horas</option>
                  </select>
                </div>
              </ModalField>
            </div>

            <ModalField label="Cor">
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    onClick={() => setColor(c)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      background: c,
                      border:
                        color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                      boxShadow: color === c ? "0 0 0 2px var(--bg-surface) inset" : "none",
                    }}
                  />
                ))}
              </div>
            </ModalField>

            <ModalField label="Ícone">
              <div className="flex flex-wrap" style={{ gap: 4 }}>
                {PRESET_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      fontSize: 16,
                      background:
                        emoji === e
                          ? `color-mix(in oklab, ${color} 15%, var(--bg-overlay))`
                          : "var(--bg-overlay)",
                      border:
                        emoji === e
                          ? `1px solid ${color}`
                          : "1px solid var(--border)",
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </ModalField>

            <ModalField label="Status">
              <div
                className="inline-flex items-center"
                style={{
                  gap: 2,
                  padding: 2,
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  width: "fit-content",
                }}
              >
                {(["active", "inactive", "draft"] as ServiceStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    style={{
                      height: 26,
                      padding: "0 12px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      background: status === s ? "var(--bg-surface)" : "transparent",
                      color:
                        status === s ? STATUS_COLOR[s] : "var(--text-muted)",
                      border:
                        status === s ? "1px solid var(--border)" : "1px solid transparent",
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </ModalField>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end"
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            <Check size={14} />
            {initial ? "Salvar alterações" : "Criar serviço"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  fontSize: 13,
  color: "var(--text-primary)",
  background: "var(--bg-base)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  outline: "none",
  fontFamily: "inherit",
};

function ModalField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}
