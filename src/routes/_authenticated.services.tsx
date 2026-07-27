import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Pencil, Archive, X, Check, MoreVertical, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import {
  type Service,
  type ServiceStatus,
  type PriceDisclosurePolicy,
  type PhotoSendPolicy,
  type ServicePhoto,
  PRESET_COLORS,
  WHATSAPP_IMAGE_MIMES,
  STATUS_COLOR,
  STATUS_LABEL,
  formatCurrencyBRL,
  formatCurrencyInput,
  formatDuration,
  parseCurrencyToCents,
} from "@/features/services/data";

import { ManagerOnly } from "@/components/manager-only";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { uploadChatMedia } from "@/lib/chat-media";

const MAX_SERVICE_PHOTOS = 6;

export const Route = createFileRoute("/_authenticated/services")({
  component: () => (
    <ManagerOnly>
      <ServicesPage />
    </ManagerOnly>
  ),
});

type Editing = { mode: "create" } | { mode: "edit"; service: Service } | null;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Garante um arquivo que o WhatsApp renderize como imagem. Formatos já
 * suportados (JPG/PNG/WebP) passam sem tocar — preserva transparência do PNG.
 * O resto (AVIF do Instagram, etc.) é redesenhado num canvas e re-exportado
 * como JPEG. Se o browser não decodificar o formato (HEIC no Chrome, p.ex.),
 * lança com mensagem clara em vez de subir algo que falharia no envio.
 */
async function toWhatsappImage(file: File): Promise<File> {
  const mime = (file.type || "").toLowerCase();
  if (WHATSAPP_IMAGE_MIMES.includes(mime)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Não consegui ler essa imagem. Tente salvar como JPG ou PNG antes de enviar.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Falha ao processar a imagem.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Falha ao converter a imagem.");
  const baseName = file.name.replace(/\.[^./\\]+$/, "") || "foto";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

const FALLBACK_DESCRIPTION_EXAMPLE =
  "Descreva o que está incluso, materiais usados, duração média e quaisquer pré-requisitos para o cliente.";

function ServicesPage() {
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const [services, setServices] = React.useState<Service[]>([]);
  const [descriptionExample, setDescriptionExample] = React.useState<string>(
    FALLBACK_DESCRIPTION_EXAMPLE,
  );

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
      const [{ data: svc, error: svcErr }, { data: profile }] = await Promise.all([
        supabase
          .from("services")
          .select(
            "id,name,description,price_cents,duration_minutes,buffer_minutes,color,status,created_at,price_disclosure_policy,photo_send_policy,photos",
          )
          .eq("owner_user_id", workspaceOwnerId)
          .order("created_at", { ascending: true }),
        supabase
          .from("profiles")
          .select("ai_segments:segment_id ( example_service_description )")
          .eq("id", workspaceOwnerId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (svcErr) {
        console.warn("[services] erro ao ler:", svcErr.message);
        notify.error(`Falha ao carregar serviços: ${svcErr.message}`);
      }
      const segExample = (profile as any)?.ai_segments?.example_service_description;
      if (typeof segExample === "string" && segExample.trim().length > 0) {
        setDescriptionExample(segExample);
      }
      // Substitui SEMPRE pelo que veio do banco (mesmo lista vazia) — assim
      // SEEDs locais não confundem o usuário fingindo que existem serviços.
      setServices(
        (svc ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          price_cents: s.price_cents ?? 0,
          duration_minutes: s.duration_minutes ?? 30,
          buffer_minutes: s.buffer_minutes ?? 0,
          color: s.color ?? "#25C880",
          status: (s.status ?? "active") as ServiceStatus,
          created_at: s.created_at ? new Date(s.created_at) : new Date(),
          price_disclosure_policy: s.price_disclosure_policy ?? null,
          photo_send_policy: s.photo_send_policy ?? null,
          photos: Array.isArray(s.photos) ? s.photos : [],
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
      if (query) {
        const q = query.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, query, hydrated]);

  const upsertService = async (draft: Service) => {
    if (!workspaceOwnerId) {
      notify.error("Carregando sua conta… tente novamente em instantes.");
      return;
    }
    const exists = services.some((s) => s.id === draft.id) && isUuid(draft.id);
    const color =
      draft.color || PRESET_COLORS[services.length % PRESET_COLORS.length];

    const payload: Record<string, unknown> = {
      owner_user_id: workspaceOwnerId,
      name: draft.name,
      description: draft.description,
      price_cents: draft.price_cents,
      duration_minutes: draft.duration_minutes,
      buffer_minutes: draft.buffer_minutes,
      color,
      status: draft.status,
      price_disclosure_policy: draft.price_disclosure_policy,
      photo_send_policy: draft.photo_send_policy,
      photos: draft.photos,
    };
    const query = exists
      ? supabase
          .from("services")
          .update(payload)
          .eq("id", draft.id)
          .select("id,created_at")
          .single()
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
      return [...without, { ...draft, id: finalId, created_at, color }];
    });
    setEditing(null);
    notify.success(exists ? "Serviço atualizado." : "Serviço criado.");
  };

  const archiveService = async (id: string) => {
    const { error } = await supabase.from("services").update({ status: "inactive" }).eq("id", id);
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

  const [confirmDelete, setConfirmDelete] = React.useState<Service | null>(null);

  const deleteService = async (id: string) => {
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      console.error("[services] falha ao excluir:", error);
      notify.error(`Não foi possível excluir: ${error.message}`);
      return;
    }
    setServices((prev) => prev.filter((s) => s.id !== id));
    notify.success("Serviço excluído.");
  };

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Serviços</h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {services.length} serviço{services.length === 1 ? "" : "s"}
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
              onEdit={() => setEditing({ mode: "edit", service: s })}
              onArchive={() => archiveService(s.id)}
              onDelete={() => setConfirmDelete(s)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ServiceModal
          initial={editing.mode === "edit" ? editing.service : null}
          descriptionExample={descriptionExample}
          workspaceOwnerId={workspaceOwnerId}
          onClose={() => setEditing(null)}
          onSubmit={upsertService}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void deleteService(confirmDelete.id);
        }}
        title="Excluir serviço"
        description={`Tem certeza que deseja excluir "${confirmDelete?.name ?? ""}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
      />
    </div>
  );
}

/* -------------- Service Card -------------- */

function ServiceCard({
  service,
  onEdit,
  onArchive,
  onDelete,
}: {
  service: Service;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const accent = service.color;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
      {/* Top row: status badge + 3-dot menu */}
      <div
        className="flex items-center"
        style={{ position: "absolute", top: 10, right: 10, gap: 6 }}
      >
        <span
          style={{
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
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Ações"
            className="inline-flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                minWidth: 160,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
                padding: 4,
                zIndex: 20,
              }}
            >
              <MenuItem
                icon={<Pencil size={13} />}
                label="Editar"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              />
              <MenuItem
                icon={<Archive size={13} />}
                label="Arquivar"
                onClick={() => {
                  setMenuOpen(false);
                  onArchive();
                }}
              />
              <MenuItem
                icon={<Trash2 size={13} />}
                label="Excluir"
                destructive
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="min-w-0" style={{ paddingRight: 96 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 2,
          }}
        >
          Nome do serviço
        </div>
        <div
          className="truncate"
          style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
        >
          {service.name}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border)" }} />

      {/* Meta */}
      <div className="flex flex-col" style={{ gap: 6, fontSize: 12 }}>
        <MetaRow
          label="Tempo"
          value={
            service.buffer_minutes > 0
              ? `${formatDuration(service.duration_minutes)} + ${service.buffer_minutes}min intervalo`
              : formatDuration(service.duration_minutes)
          }
        />
        <MetaRow
          label="Valor"
          value={formatCurrencyBRL(service.price_cents)}
          valueStyle={{ fontWeight: 600, fontFamily: "var(--font-mono, ui-monospace)" }}
        />
        {service.description ? (
          <MetaRow label="Descrição" value={service.description} muted />
        ) : (
          <button
            type="button"
            onClick={onEdit}
            title="Clique para adicionar uma descrição"
            style={{
              marginTop: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid color-mix(in oklab, var(--warning, #d97706) 35%, transparent)",
              background: "color-mix(in oklab, var(--warning, #d97706) 10%, transparent)",
              color: "var(--warning, #b45309)",
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.3,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span aria-hidden>⚠</span>
            Sem descrição — a IA não terá contexto para falar deste serviço
          </button>
        )}
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  muted,
  valueStyle,
}: {
  label: string;
  value: string;
  muted?: boolean;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="flex items-start" style={{ gap: 6, lineHeight: 1.4 }}>
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}:</span>
      <span
        style={{
          color: muted ? "var(--text-muted)" : "var(--text-primary)",
          ...valueStyle,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex items-center w-full"
      style={{
        gap: 8,
        padding: "7px 10px",
        borderRadius: 6,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        color: destructive ? "var(--danger)" : "var(--text-primary)",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-overlay)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {icon}
      {label}
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
      <div
        style={{
          fontSize: 11,
          marginTop: 8,
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.5,
          color: "var(--text-muted)",
        }}
      >
        💡 A IA do WhatsApp usa estes serviços e suas descrições para responder seus clientes. Sem
        nenhum serviço cadastrado, ela redireciona para atendimento humano.
      </div>
      <button type="button" onClick={onCreate} className="btn-primary" style={{ marginTop: 16 }}>
        <Plus size={14} />
        Novo Serviço
      </button>
    </div>
  );
}

/* -------------- Modal -------------- */

function ServiceModal({
  initial,
  descriptionExample,
  workspaceOwnerId,
  onClose,
  onSubmit,
}: {
  initial: Service | null;
  descriptionExample: string;
  workspaceOwnerId: string | null | undefined;
  onClose: () => void;
  onSubmit: (s: Service) => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [priceText, setPriceText] = React.useState(
    initial ? formatCurrencyInput(initial.price_cents) : "0,00",
  );
  // Serviço antigo sem política definida cai no padrão conservador — mesmo
  // default que o servidor aplica ao montar o prompt.
  const [priceDisclosurePolicy, setPriceDisclosurePolicy] = React.useState<PriceDisclosurePolicy>(
    initial?.price_disclosure_policy ?? "on_request",
  );
  const [photoSendPolicy, setPhotoSendPolicy] = React.useState<PhotoSendPolicy>(
    initial?.photo_send_policy ?? "never",
  );
  const [photos, setPhotos] = React.useState<ServicePhoto[]>(initial?.photos ?? []);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [durationValue, setDurationValue] = React.useState(() => {
    const m = initial?.duration_minutes ?? 30;
    return m % 60 === 0 && m >= 60 ? String(m / 60) : String(m);
  });
  const [durationUnit, setDurationUnit] = React.useState<"min" | "h">(() => {
    const m = initial?.duration_minutes ?? 30;
    return m % 60 === 0 && m >= 60 ? "h" : "min";
  });
  const [bufferMinutes, setBufferMinutes] = React.useState(String(initial?.buffer_minutes ?? 0));

  const [status, setStatus] = React.useState<ServiceStatus>(initial?.status ?? "active");

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

  const handleAddPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!workspaceOwnerId) {
      notify.error("Carregando sua conta… tente novamente em instantes.");
      return;
    }
    if (photos.length >= MAX_SERVICE_PHOTOS) {
      notify.error(`Máximo de ${MAX_SERVICE_PHOTOS} fotos por serviço.`);
      return;
    }
    setUploadingPhoto(true);
    try {
      // O WhatsApp não renderiza AVIF/HEIC como imagem. Em vez de recusar
      // (fotos baixadas do Instagram quase sempre vêm em AVIF), converte pra
      // JPEG na hora — o cliente nem percebe. Formatos que já funcionam
      // (JPG/PNG/WebP) passam intactos, preservando transparência do PNG.
      const usable = await toWhatsappImage(file);
      const { url } = await uploadChatMedia(usable, workspaceOwnerId);
      setPhotos((prev) => [
        ...prev,
        { id: crypto.randomUUID(), url, caption: "", mime: usable.type },
      ]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Falha ao enviar foto.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleChangePhotoCaption = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
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
    const buffer = Math.max(0, parseInt(bufferMinutes, 10) || 0);

    const draft: Service = {
      id: initial?.id ?? `srv-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      price_cents: cents,
      duration_minutes: minutes,
      buffer_minutes: buffer,
      color: initial?.color ?? "",
      status,
      created_at: initial?.created_at ?? new Date(),
      price_disclosure_policy: priceDisclosurePolicy,
      photo_send_policy: photoSendPolicy,
      photos,
    };
    onSubmit(draft);
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

            <ModalField label="Descrição">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder={`Ex.: ${descriptionExample}`}
                rows={3}
                style={{
                  ...inputStyle,
                  height: "auto",
                  resize: "vertical",
                  padding: "8px 10px",
                  lineHeight: 1.4,
                }}
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  lineHeight: 1.4,
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-start",
                }}
              >
                <span aria-hidden style={{ flexShrink: 0 }}>
                  💡
                </span>
                <span>
                  Esta descrição é usada pela IA do WhatsApp para responder seus clientes sobre este
                  serviço. Quanto mais específica, melhor a IA atende — sem ela, a IA não terá
                  contexto e vai redirecionar para um atendente humano.
                </span>
              </div>
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

            <ModalField label="Quando a IA pode informar o preço deste serviço?">
              <select
                value={priceDisclosurePolicy}
                onChange={(e) =>
                  setPriceDisclosurePolicy(e.target.value as PriceDisclosurePolicy)
                }
                style={inputStyle}
              >
                <option value="always">Sempre, proativamente</option>
                <option value="on_request">Apenas quando o cliente perguntar</option>
                <option value="never">Nunca — direcionar para atendente</option>
              </select>
            </ModalField>

            <ModalField label="Intervalo após o atendimento (min)">
              <input
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                placeholder="0"
                style={{ ...inputStyle, width: 120, textAlign: "right" }}
              />
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Tempo de folga antes do próximo atendimento do mesmo profissional (limpeza, preparo
                etc).
              </div>
            </ModalField>

            <ModalField label="Fotos (opcional)">
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                  lineHeight: 1.4,
                }}
              >
                Fotos que a IA pode enviar durante a conversa, conforme a política abaixo.
              </div>
              {photos.length > 0 && (
                <div className="flex flex-col" style={{ gap: 8, marginBottom: 8 }}>
                  {photos.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <img
                        src={p.url}
                        alt={p.caption || "Foto do serviço"}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 6,
                          objectFit: "cover",
                          border: "1px solid var(--border)",
                          flexShrink: 0,
                        }}
                      />
                      <input
                        value={p.caption}
                        onChange={(e) => handleChangePhotoCaption(p.id, e.target.value)}
                        placeholder="Legenda (ex.: Antes, Depois)"
                        style={{ ...inputStyle, flex: 1 }}
                        maxLength={60}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(p.id)}
                        title="Remover foto"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < MAX_SERVICE_PHOTOS && (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    cursor: uploadingPhoto ? "default" : "pointer",
                    opacity: uploadingPhoto ? 0.6 : 1,
                  }}
                >
                  <Plus size={14} />
                  {uploadingPhoto ? "Enviando…" : "Adicionar foto"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={uploadingPhoto}
                    onChange={(e) => {
                      void handleAddPhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <div style={{ marginTop: 10 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginBottom: 4,
                  }}
                >
                  Quando a IA pode enviar fotos deste serviço?
                </label>
                <select
                  value={photoSendPolicy}
                  onChange={(e) => setPhotoSendPolicy(e.target.value as PhotoSendPolicy)}
                  style={inputStyle}
                >
                  <option value="never">Nunca</option>
                  <option value="on_request">Apenas quando o cliente pedir</option>
                  <option value="proactive">Proativamente ao mencionar o serviço</option>
                </select>
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
                      color: status === s ? STATUS_COLOR[s] : "var(--text-muted)",
                      border: status === s ? "1px solid var(--border)" : "1px solid transparent",
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
