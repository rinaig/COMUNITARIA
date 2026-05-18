"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppRole } from "@/lib/domain";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type TopicRow = {
  id: string;
  titulo: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

type ProfileSummary = {
  id: string;
  nombre: string;
  apellido: string;
  rol: AppRole;
  consorcio_id: string | null;
  es_menor?: boolean | null;
};

type MessageRow = {
  id: string;
  topic_id: string;
  autor_id: string | null;
  cuerpo: string;
  estado: "publicado" | "pendiente_adulto" | "rechazado";
  created_at: string;
};

type MessageView = MessageRow & {
  autorNombre: string;
  autorRol: AppRole | null;
};

const roleLabels: Record<AppRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Administrador",
  residente: "Residente",
  seguridad: "Seguridad",
};

export function CommunityTopicsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [loadingTopics, setLoadingTopics] = useState(() => configured);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [submittingTopic, setSubmittingTopic] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = profile?.rol === "admin";

  const visibleTopics = useMemo(
    () => (isAdmin ? topics : topics.filter((topic) => topic.activo)),
    [isAdmin, topics],
  );

  const selectedTopic = visibleTopics.find((topic) => topic.id === selectedTopicId) ?? null;

  const loadTopics = useCallback(
    async (preferredTopicId?: string) => {
      if (!supabase) {
        return;
      }

      setLoadingTopics(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("chat_topics")
        .select("id, titulo, descripcion, orden, activo, created_at, updated_at")
        .order("orden", { ascending: true })
        .order("updated_at", { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setLoadingTopics(false);
        return;
      }

      const nextTopics = (data as TopicRow[] | null) ?? [];
      setTopics(nextTopics);

      const activeTopics = nextTopics.filter((topic) => topic.activo);
      const fallbackTopicId = preferredTopicId
        && nextTopics.some((topic) => topic.id === preferredTopicId)
        ? preferredTopicId
        : activeTopics[0]?.id ?? nextTopics[0]?.id ?? "";

      setSelectedTopicId((current) => {
        if (preferredTopicId && nextTopics.some((topic) => topic.id === preferredTopicId)) {
          return preferredTopicId;
        }
        if (current && nextTopics.some((topic) => topic.id === current)) {
          return current;
        }
        return fallbackTopicId;
      });
      setLoadingTopics(false);
    },
    [supabase],
  );

  const loadMessages = useCallback(
    async (topicId: string) => {
      if (!supabase || !topicId) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("chat_mensajes")
        .select("id, topic_id, autor_id, cuerpo, estado, created_at")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true })
        .limit(80);

      if (loadError) {
        setError(loadError.message);
        setLoadingMessages(false);
        return;
      }

      const rows = (data as MessageRow[] | null) ?? [];
      const authorIds = Array.from(new Set(rows.map((item) => item.autor_id).filter(Boolean))) as string[];

      let profileMap = new Map<string, ProfileSummary>();
      if (authorIds.length > 0) {
        const { data: authorData, error: authorError } = await supabase
          .from("profiles")
          .select("id, nombre, apellido, rol, consorcio_id")
          .in("id", authorIds);

        if (authorError) {
          setError(authorError.message);
          setLoadingMessages(false);
          return;
        }

        profileMap = new Map(((authorData as ProfileSummary[] | null) ?? []).map((item) => [item.id, item]));
      }

      setMessages(
        rows.map((item) => {
          const author = item.autor_id ? profileMap.get(item.autor_id) : null;
          return {
            ...item,
            autorNombre: author ? `${author.nombre} ${author.apellido}`.trim() : "Usuario",
            autorRol: author?.rol ?? null,
          } satisfies MessageView;
        }),
      );
      setLoadingMessages(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let ignore = false;

    const loadInitialData = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (ignore) {
        return;
      }
      if (sessionError) {
        setError(sessionError.message);
        setLoadingTopics(false);
        return;
      }

      const activeSession = data.session ?? null;
      setSession(activeSession);

      if (!activeSession?.user) {
        setLoadingTopics(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, nombre, apellido, rol, consorcio_id, es_menor")
        .eq("id", activeSession.user.id)
        .single();

      if (ignore) {
        return;
      }

      if (profileError) {
        setError(profileError.message);
        setLoadingTopics(false);
        return;
      }

      setProfile((profileData as ProfileSummary | null) ?? null);
      await loadTopics();
    };

    void loadInitialData();

    return () => {
      ignore = true;
    };
  }, [loadTopics, supabase]);

  useEffect(() => {
    if (!session?.user || !selectedTopicId) {
      return;
    }

    const load = async () => {
      await loadMessages(selectedTopicId);
    };

    void load();
  }, [loadMessages, selectedTopicId, session]);

  async function handleCreateTopic() {
    if (!supabase || !profile?.consorcio_id || !isAdmin) {
      return;
    }

    const cleanedTitle = topicTitle.trim();
    const cleanedDescription = topicDescription.trim();

    if (!cleanedTitle) {
      setError("Indica un titulo para crear el tema.");
      return;
    }

    setSubmittingTopic(true);
    setError("");
    setMessage("");

    const nextOrder = topics.reduce((maxOrder, topic) => Math.max(maxOrder, topic.orden), -1) + 1;

    const { data, error: createError } = await supabase
      .from("chat_topics")
      .insert({
        consorcio_id: profile.consorcio_id,
        titulo: cleanedTitle,
        descripcion: cleanedDescription || null,
        orden: nextOrder,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (createError) {
      setError(createError.message);
      setSubmittingTopic(false);
      return;
    }

    setTopicTitle("");
    setTopicDescription("");
    await loadTopics((data as { id: string }).id);
    setSubmittingTopic(false);
  }

  async function handleToggleTopic(topic: TopicRow) {
    if (!supabase || !isAdmin) {
      return;
    }

    setError("");
    setMessage("");

    const { error: updateError } = await supabase
      .from("chat_topics")
      .update({ activo: !topic.activo })
      .eq("id", topic.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadTopics(topic.activo && selectedTopicId === topic.id ? undefined : topic.id);
  }

  async function handleSendMessage() {
    if (!supabase || !profile?.consorcio_id || !selectedTopicId) {
      return;
    }

    const cleanedMessage = messageDraft.trim();
    if (!cleanedMessage) {
      setError("Escribe un mensaje antes de enviarlo.");
      return;
    }

    setSubmittingMessage(true);
    setError("");
    setMessage("");

    const { data, error: insertError } = await supabase.rpc("submit_chat_message", {
      p_topic_id: selectedTopicId,
      p_cuerpo: cleanedMessage,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmittingMessage(false);
      return;
    }

    const nextState = ((data as { estado?: string }[] | null) ?? [])[0]?.estado ?? "publicado";

    setMessageDraft("");
    setMessage(
      nextState === "pendiente_adulto"
        ? "Tu mensaje quedo pendiente de aprobacion adulta antes de publicarse."
        : nextState === "rechazado"
          ? "El mensaje quedo marcado como rechazado."
          : "Mensaje publicado correctamente.",
    );
    await Promise.all([loadMessages(selectedTopicId), loadTopics(selectedTopicId)]);
    setSubmittingMessage(false);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="glass-panel mt-6 rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Comunidad</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Chat por temas del consorcio
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Cada conversacion queda ordenada por tema para evitar anuncios mezclados con consultas diarias, seguridad o convivencia.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
          Perfil activo: <span className="font-semibold text-slate-950">{profile ? roleLabels[profile.rol] : "Cargando"}</span>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">{error}</p> : null}
      {message ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">{message}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          {isAdmin ? (
            <article className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Administracion</p>
                  <h4 className="mt-2 text-xl font-semibold text-slate-950">Crear tema</h4>
                </div>
                <span className="status-badge status-badge--neutral">Ordenado por areas</span>
              </div>
              <div className="mt-4 grid gap-3">
                <label>
                  <span className="field-label">Titulo</span>
                  <input className="field-input mt-2" onChange={(event) => setTopicTitle(event.target.value)} placeholder="Ej: Seguridad nocturna" value={topicTitle} />
                </label>
                <label>
                  <span className="field-label">Descripcion</span>
                  <textarea className="field-textarea mt-2" onChange={(event) => setTopicDescription(event.target.value)} placeholder="Que se discute en este tema" rows={3} value={topicDescription} />
                </label>
                <button className="button-primary" disabled={submittingTopic} onClick={() => void handleCreateTopic()} type="button">
                  {submittingTopic ? "Creando tema..." : "Crear tema"}
                </button>
              </div>
            </article>
          ) : null}

          <article className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Temas</p>
                <h4 className="mt-2 text-xl font-semibold text-slate-950">Canales activos</h4>
              </div>
              <span className="text-sm text-slate-500">{visibleTopics.length} disponibles</span>
            </div>

            <div className="mt-4 grid gap-3">
              {loadingTopics ? <p className="text-sm leading-7 text-slate-600">Cargando temas.</p> : visibleTopics.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay temas creados para este consorcio.</p> : visibleTopics.map((topic) => <div className={selectedTopicId === topic.id ? "rounded-2xl border border-slate-900 bg-slate-900 p-4 text-white" : "rounded-2xl border border-slate-200 bg-slate-50/85 p-4 text-slate-900"} key={topic.id}><div className="flex items-start justify-between gap-3"><button className="flex-1 text-left" onClick={() => setSelectedTopicId(topic.id)} type="button"><div className="flex items-center gap-2"><h5 className="text-sm font-semibold">{topic.titulo}</h5>{!topic.activo ? <span className={selectedTopicId === topic.id ? "rounded-full bg-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white" : "rounded-full bg-slate-200 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-600"}>archivado</span> : null}</div><p className={selectedTopicId === topic.id ? "mt-2 text-sm leading-6 text-slate-200" : "mt-2 text-sm leading-6 text-slate-600"}>{topic.descripcion ?? "Sin descripcion adicional."}</p><p className={selectedTopicId === topic.id ? "mt-3 text-xs uppercase tracking-[0.16em] text-slate-300" : "mt-3 text-xs uppercase tracking-[0.16em] text-slate-400"}>Actualizado {new Date(topic.updated_at).toLocaleString("es-AR")}</p></button>{isAdmin ? <button className={selectedTopicId === topic.id ? "button-secondary" : "button-primary"} onClick={() => void handleToggleTopic(topic)} type="button">{topic.activo ? "Archivar" : "Reactivar"}</button> : null}</div></div>)}
            </div>
          </article>
        </div>

        <article className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Conversacion</p>
              <h4 className="mt-2 text-xl font-semibold text-slate-950">{selectedTopic?.titulo ?? "Selecciona un tema"}</h4>
              <p className="mt-2 text-sm leading-7 text-slate-600">{selectedTopic?.descripcion ?? "Los mensajes quedan agrupados por tema para evitar dispersion."}</p>
            </div>
            {selectedTopic ? <span className={selectedTopic.activo ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>{selectedTopic.activo ? "activo" : "archivado"}</span> : null}
          </div>

          <div className="mt-5 grid max-h-[28rem] gap-3 overflow-y-auto pr-1">
            {!selectedTopic ? <p className="text-sm leading-7 text-slate-600">Elegi un tema para ver la conversacion.</p> : loadingMessages ? <p className="text-sm leading-7 text-slate-600">Cargando mensajes.</p> : messages.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay mensajes en este tema.</p> : messages.map((message) => <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4" key={message.id}><div className="flex items-start justify-between gap-3"><div><h5 className="text-sm font-semibold text-slate-950">{message.autorNombre}</h5><p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{message.autorRol ? roleLabels[message.autorRol] : "Perfil"}</p></div><div className="flex flex-col items-end gap-2"><span className="text-xs uppercase tracking-[0.16em] text-slate-400">{new Date(message.created_at).toLocaleString("es-AR")}</span>{message.estado !== "publicado" ? <span className="status-badge status-badge--warning">{message.estado === "pendiente_adulto" ? "pendiente adulto" : "rechazado"}</span> : null}</div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.cuerpo}</p></div>)}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-5">
            {selectedTopic && !selectedTopic.activo && !isAdmin ? <p className="text-sm leading-7 text-slate-600">Este tema fue archivado por la administracion y quedo solo para consulta.</p> : <><label>
              <span className="field-label">Nuevo mensaje</span>
              <textarea className="field-textarea mt-2" onChange={(event) => setMessageDraft(event.target.value)} placeholder={selectedTopic ? `Escribe en ${selectedTopic.titulo}` : "Selecciona un tema primero"} rows={4} value={messageDraft} />
            </label>
            {profile?.es_menor ? <p className="mt-3 text-sm leading-7 text-slate-600">Los mensajes enviados desde perfiles menores quedan pendientes hasta que un adulto responsable los apruebe.</p> : null}
            <div className="mt-3 flex justify-end">
              <button className="button-primary" disabled={!selectedTopic || submittingMessage || (!selectedTopic?.activo && !isAdmin)} onClick={() => void handleSendMessage()} type="button">
                {submittingMessage ? "Enviando..." : "Enviar mensaje"}
              </button>
            </div></>}
          </div>
        </article>
      </div>
    </section>
  );
}