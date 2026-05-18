"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PendingReservation = {
  reservation_id: string;
  menor_id: string;
  menor_nombre: string;
  menor_apellido: string;
  amenity_nombre: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
};

type PendingVisit = {
  authorization_id: string;
  menor_id: string;
  menor_nombre: string;
  menor_apellido: string;
  visitante_nombre: string;
  fecha_visita: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  estado: string;
};

type PendingChatMessage = {
  message_id: string;
  menor_id: string;
  menor_nombre: string;
  menor_apellido: string;
  topic_id: string;
  topic_titulo: string;
  cuerpo: string;
  estado: string;
  created_at: string;
};

export function ResidentDependentApprovalsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reservations, setReservations] = useState<PendingReservation[]>([]);
  const [visits, setVisits] = useState<PendingVisit[]>([]);
  const [chatMessages, setChatMessages] = useState<PendingChatMessage[]>([]);

  const loadPendingItems = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const [reservationsResult, visitsResult, chatResult] = await Promise.all([
      supabase.rpc("list_pending_dependent_reservations"),
      supabase.rpc("list_pending_dependent_visits"),
      supabase.rpc("list_pending_dependent_chat_messages"),
    ]);

    const firstError = reservationsResult.error ?? visitsResult.error ?? chatResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setReservations((reservationsResult.data as PendingReservation[] | null) ?? []);
    setVisits((visitsResult.data as PendingVisit[] | null) ?? []);
    setChatMessages((chatResult.data as PendingChatMessage[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let ignore = false;
    const load = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (ignore) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      setSession(data.session ?? null);
      if (data.session?.user) {
        await loadPendingItems();
      } else {
        setLoading(false);
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [loadPendingItems, supabase]);

  async function handleReservationReview(reservationId: string, nextStatus: "aprobada" | "rechazada") {
    if (!supabase) {
      return;
    }

    setBusyId(reservationId);
    setError("");
    setMessage("");

    const { error: reviewError } = await supabase.rpc("review_dependent_reservation_request", {
      p_reservation_id: reservationId,
      p_estado: nextStatus,
    });

    if (reviewError) {
      setError(reviewError.message);
      setBusyId("");
      return;
    }

    setMessage(nextStatus === "aprobada" ? "Reserva del dependiente revisada correctamente." : "Reserva del dependiente rechazada.");
    await loadPendingItems();
    setBusyId("");
  }

  async function handleVisitReview(authorizationId: string, nextStatus: "aprobada" | "rechazada") {
    if (!supabase) {
      return;
    }

    setBusyId(authorizationId);
    setError("");
    setMessage("");

    const { error: reviewError } = await supabase.rpc("review_dependent_visit_authorization", {
      p_authorization_id: authorizationId,
      p_estado: nextStatus,
    });

    if (reviewError) {
      setError(reviewError.message);
      setBusyId("");
      return;
    }

    setMessage(nextStatus === "aprobada" ? "Visita del dependiente aprobada correctamente." : "Visita del dependiente rechazada.");
    await loadPendingItems();
    setBusyId("");
  }

  async function handleChatReview(messageId: string, nextStatus: "aprobada" | "rechazada") {
    if (!supabase) {
      return;
    }

    setBusyId(messageId);
    setError("");
    setMessage("");

    const { error: reviewError } = await supabase.rpc("review_dependent_chat_message", {
      p_message_id: messageId,
      p_estado: nextStatus,
    });

    if (reviewError) {
      setError(reviewError.message);
      setBusyId("");
      return;
    }

    setMessage(nextStatus === "aprobada" ? "Mensaje del dependiente aprobado y publicado." : "Mensaje del dependiente rechazado.");
    await loadPendingItems();
    setBusyId("");
  }

  if (!configured || !session?.user) {
    return null;
  }

  if (!loading && reservations.length === 0 && visits.length === 0 && chatMessages.length === 0 && !error && !message) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Dependientes</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Aprobaciones de menores a cargo</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Si un perfil marcado como menor solicita una reserva, una visita o publica en el chat, la autorizacion final pasa por este panel.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      {loading ? <div className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando solicitudes de dependientes.</p></div> : <div className="mt-6 grid gap-6 xl:grid-cols-3"><article className="role-card"><p className="text-sm uppercase tracking-[0.2em] text-slate-500">Reservas pendientes</p><div className="mt-4 grid gap-3">{reservations.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay reservas pendientes de dependientes.</p> : reservations.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.reservation_id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.menor_nombre} {item.menor_apellido}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{item.amenity_nombre}</p></div><span className="status-badge status-badge--warning">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{new Date(item.fecha).toLocaleDateString("es-AR")} · {item.hora_inicio.slice(0, 5)} a {item.hora_fin.slice(0, 5)}</p><div className="mt-4 flex flex-wrap gap-3"><button className="button-primary" disabled={busyId === item.reservation_id} onClick={() => void handleReservationReview(item.reservation_id, "aprobada")} type="button">{busyId === item.reservation_id ? "Procesando..." : "Aprobar"}</button><button className="button-secondary" disabled={busyId === item.reservation_id} onClick={() => void handleReservationReview(item.reservation_id, "rechazada")} type="button">Rechazar</button></div></div>)}</div></article><article className="role-card"><p className="text-sm uppercase tracking-[0.2em] text-slate-500">Visitas pendientes</p><div className="mt-4 grid gap-3">{visits.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay visitas pendientes de dependientes.</p> : visits.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.authorization_id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.menor_nombre} {item.menor_apellido}</h4><p className="mt-1 text-sm leading-7 text-slate-600">Visita para {item.visitante_nombre}</p></div><span className="status-badge status-badge--warning">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{new Date(item.fecha_visita).toLocaleDateString("es-AR")} · {(item.hora_desde ?? "--:--").slice(0, 5)} a {(item.hora_hasta ?? "--:--").slice(0, 5)}</p><div className="mt-4 flex flex-wrap gap-3"><button className="button-primary" disabled={busyId === item.authorization_id} onClick={() => void handleVisitReview(item.authorization_id, "aprobada")} type="button">{busyId === item.authorization_id ? "Procesando..." : "Aprobar"}</button><button className="button-secondary" disabled={busyId === item.authorization_id} onClick={() => void handleVisitReview(item.authorization_id, "rechazada")} type="button">Rechazar</button></div></div>)}</div></article><article className="role-card"><p className="text-sm uppercase tracking-[0.2em] text-slate-500">Chat pendiente</p><div className="mt-4 grid gap-3">{chatMessages.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay mensajes pendientes de dependientes.</p> : chatMessages.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.message_id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.menor_nombre} {item.menor_apellido}</h4><p className="mt-1 text-sm leading-7 text-slate-600">Tema: {item.topic_titulo}</p></div><span className="status-badge status-badge--warning">{item.estado}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.cuerpo}</p><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.created_at).toLocaleString("es-AR")}</p><div className="mt-4 flex flex-wrap gap-3"><button className="button-primary" disabled={busyId === item.message_id} onClick={() => void handleChatReview(item.message_id, "aprobada")} type="button">{busyId === item.message_id ? "Procesando..." : "Aprobar"}</button><button className="button-secondary" disabled={busyId === item.message_id} onClick={() => void handleChatReview(item.message_id, "rechazada")} type="button">Rechazar</button></div></div>)}</div></article></div>}
    </section>
  );
}
