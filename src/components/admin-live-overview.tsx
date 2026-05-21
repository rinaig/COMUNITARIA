"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type LiveMetric = {
  label: string;
  value: string;
  detail: string;
};

type ActivityItem = {
  title: string;
  detail: string;
  status: string;
  date: string;
};

type AnnouncementItem = {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: number;
  publicado_at: string;
};

type ClaimItem = {
  id: string;
  titulo: string;
  estado: string;
  created_at: string;
  unidad_id: string | null;
};

type ReservationItem = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
};

type OutboundItem = {
  id: string;
  asunto: string;
  estado: string;
  canal: "email" | "whatsapp";
  proveedor: string | null;
  destinatario_email: string | null;
  destinatario_ref: string | null;
  created_at: string;
};

const channelLabels = {
  email: "Email",
  whatsapp: "WhatsApp",
} as const;

export function AdminLiveOverview() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<LiveMetric[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const loadOverview = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const [
      claimsCountResult,
      pendingResidentsResult,
      reservationsResult,
      pendingOutboundResult,
      failedOutboundResult,
      expensesResult,
      latestAnnouncementsResult,
      latestClaimsResult,
      latestReservationsResult,
      latestOutboundResult,
    ] = await Promise.all([
      supabase
        .from("reclamos")
        .select("id", { count: "exact", head: true })
        .neq("estado", "finalizado"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .eq("rol", "residente"),
      supabase
        .from("reservas")
        .select("id", { count: "exact", head: true })
        .gte("fecha", monthStart),
      supabase
        .from("notificacion_salidas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente"),
      supabase
        .from("notificacion_salidas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "fallido"),
      supabase
        .from("gastos")
        .select("monto, fecha_gasto")
        .gte("fecha_gasto", monthStart),
      supabase
        .from("anuncios")
        .select("id, titulo, contenido, prioridad, publicado_at")
        .order("publicado_at", { ascending: false })
        .limit(3),
      supabase
        .from("reclamos")
        .select("id, titulo, estado, created_at, unidad_id")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("reservas")
        .select("id, fecha, hora_inicio, hora_fin, estado")
        .order("fecha", { ascending: false })
        .limit(3),
      supabase
        .from("notificacion_salidas")
        .select("id, asunto, estado, canal, proveedor, destinatario_email, destinatario_ref, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const firstError = [
      claimsCountResult.error,
      pendingResidentsResult.error,
      reservationsResult.error,
      pendingOutboundResult.error,
      failedOutboundResult.error,
      expensesResult.error,
      latestAnnouncementsResult.error,
      latestClaimsResult.error,
      latestReservationsResult.error,
      latestOutboundResult.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const monthlyExpenseTotal = (expensesResult.data ?? []).reduce((sum, item) => {
      return sum + Number(item.monto ?? 0);
    }, 0);

    setMetrics([
      {
        label: "Reclamos abiertos",
        value: String(claimsCountResult.count ?? 0),
        detail: "Tickets no finalizados del consorcio",
      },
      {
        label: "Vecinos pendientes",
        value: String(pendingResidentsResult.count ?? 0),
        detail: "Altas esperando aprobacion",
      },
      {
        label: "Salidas pendientes",
        value: String(pendingOutboundResult.count ?? 0),
        detail: "Cola saliente por procesar",
      },
      {
        label: "Salidas fallidas",
        value: String(failedOutboundResult.count ?? 0),
        detail: "Requieren revision de canal o credenciales",
      },
      {
        label: "Reservas del mes",
        value: String(reservationsResult.count ?? 0),
        detail: `Desde ${monthStart}`,
      },
      {
        label: "Gastos del mes",
        value: `$ ${monthlyExpenseTotal.toLocaleString("es-AR")}`,
        detail: `${expensesResult.data?.length ?? 0} comprobantes cargados`,
      },
    ]);

    setAnnouncements((latestAnnouncementsResult.data as AnnouncementItem[] | null) ?? []);

    const claimActivity = ((latestClaimsResult.data as ClaimItem[] | null) ?? []).map((item) => ({
      title: item.titulo,
      detail: item.unidad_id ? `Unidad ${item.unidad_id}` : "Area comun",
      status: item.estado,
      date: new Date(item.created_at).toLocaleDateString("es-AR"),
    }));

    const reservationActivity = ((latestReservationsResult.data as ReservationItem[] | null) ?? []).map((item) => ({
      title: `Reserva ${new Date(item.fecha).toLocaleDateString("es-AR")}`,
      detail: `${item.hora_inicio.slice(0, 5)} a ${item.hora_fin.slice(0, 5)}`,
      status: item.estado,
      date: new Date(item.fecha).toLocaleDateString("es-AR"),
    }));

    const outboundActivity = ((latestOutboundResult.data as OutboundItem[] | null) ?? []).map((item) => ({
      title: item.asunto,
      detail: `${channelLabels[item.canal]} · ${item.destinatario_ref ?? item.destinatario_email ?? "sin destino"} · ${item.proveedor ?? "sin proveedor"}`,
      status: item.estado,
      date: new Date(item.created_at).toLocaleDateString("es-AR"),
    }));

    setActivity([...outboundActivity, ...claimActivity, ...reservationActivity].slice(0, 6));
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
        await loadOverview();
      } else {
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadOverview, supabase]);

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Panel en vivo
          </p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Operacion real del consorcio
          </h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">
          Este bloque ya no usa mocks: lee reclamos, reservas, anuncios, gastos y cola saliente reales segun las politicas RLS del usuario autenticado.
        </p>
      </div>

      {error ? (
        <article className="role-card mt-6 border-amber-200 bg-amber-50/80">
          <p className="text-sm font-semibold text-amber-700">Error</p>
          <p className="mt-2 text-sm leading-7 text-amber-700">{error}</p>
        </article>
      ) : null}

      {loading ? (
        <div className="role-card mt-6">
          <p className="text-sm leading-7 text-slate-700">Cargando metricas reales del consorcio.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Anuncios recientes</p>
              <div className="mt-4 grid gap-3">
                {announcements.length === 0 ? (
                  <p className="text-sm leading-7 text-slate-600">No hay anuncios cargados todavia.</p>
                ) : (
                  announcements.map((item) => (
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4>
                        <span className="status-badge status-badge--neutral">P{item.prioridad}</span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{item.contenido}</p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Actividad reciente</p>
              <div className="mt-4 grid gap-3">
                {activity.length === 0 ? (
                  <p className="text-sm leading-7 text-slate-600">Todavia no hay movimientos recientes para mostrar.</p>
                ) : (
                  activity.map((item) => (
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={`${item.title}-${item.date}`}>
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-lg font-semibold text-slate-950">{item.title}</h4>
                        <span className="status-badge status-badge--neutral">{item.status}</span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{item.detail}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.date}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}