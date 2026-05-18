"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type ResidentMetric = {
  label: string;
  value: string;
  detail: string;
};

type Announcement = {
  id: string;
  titulo: string;
  contenido: string;
  publicado_at: string;
};

type DocumentItem = {
  id: string;
  titulo: string;
  tipo: string;
  publicado_at: string;
};

type ReservationItem = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
};

type ClaimItem = {
  id: string;
  titulo: string;
  estado: string;
  created_at: string;
};

type VisitItem = {
  id: string;
  visitante_nombre: string;
  visitante_dni: string;
  fecha_visita: string;
  estado: string;
};

type ChargeMode = "admin_absorbe" | "monto_fijo_por_unidad" | "porcentaje_por_unidad";
type ChargeTarget = "propietario" | "inquilino" | "todos";

type SubscriptionChargeItem = {
  precio_lista_por_unidad: number;
  modalidad_cobro: ChargeMode;
  valor_cobro: number;
  destino_cobro: ChargeTarget;
};

function calculateResidentUnitCharge(subscription: SubscriptionChargeItem | null) {
  if (!subscription || subscription.modalidad_cobro === "admin_absorbe") {
    return 0;
  }

  if (subscription.modalidad_cobro === "monto_fijo_por_unidad") {
    return Number(subscription.valor_cobro);
  }

  return Number(subscription.precio_lista_por_unidad) * (Number(subscription.valor_cobro) / 100);
}

export function ResidentLiveOverview() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<ResidentMetric[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activity, setActivity] = useState<Array<{ title: string; detail: string; status: string }>>([]);
  const [subscriptionCharge, setSubscriptionCharge] = useState<SubscriptionChargeItem | null>(null);

  const loadOverview = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const today = new Date().toISOString().slice(0, 10);

    const [announcementsResult, documentsResult, reservationsResult, claimsResult, visitsResult, subscriptionResult] = await Promise.all([
      supabase.from("anuncios").select("id, titulo, contenido, publicado_at").order("publicado_at", { ascending: false }).limit(3),
      supabase.from("documentos_consorcio").select("id, titulo, tipo, publicado_at").eq("visible_para_residentes", true).order("publicado_at", { ascending: false }).limit(4),
      supabase.from("reservas").select("id, fecha, hora_inicio, hora_fin, estado").eq("usuario_id", userId).gte("fecha", today).order("fecha", { ascending: true }).limit(4),
      supabase.from("reclamos").select("id, titulo, estado, created_at").eq("creador_id", userId).order("created_at", { ascending: false }).limit(4),
      supabase.from("autorizaciones_visitas").select("id, visitante_nombre, visitante_dni, fecha_visita, estado").eq("residente_id", userId).gte("fecha_visita", today).order("fecha_visita", { ascending: true }).limit(4),
      supabase.from("consorcio_suscripciones").select("precio_lista_por_unidad, modalidad_cobro, valor_cobro, destino_cobro").limit(1).maybeSingle(),
    ]);

    const firstError = [
      announcementsResult.error,
      documentsResult.error,
      reservationsResult.error,
      claimsResult.error,
      visitsResult.error,
      subscriptionResult.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextReservations = (reservationsResult.data as ReservationItem[] | null) ?? [];
    const nextClaims = (claimsResult.data as ClaimItem[] | null) ?? [];
    const nextDocuments = (documentsResult.data as DocumentItem[] | null) ?? [];
    const nextVisits = (visitsResult.data as VisitItem[] | null) ?? [];
    const nextSubscription = (subscriptionResult.data as SubscriptionChargeItem | null) ?? null;

    setMetrics([
      {
        label: "Proximas reservas",
        value: String(nextReservations.length),
        detail: nextReservations[0]
          ? `${new Date(nextReservations[0].fecha).toLocaleDateString("es-AR")} ${nextReservations[0].hora_inicio.slice(0, 5)}`
          : "Sin reservas proximas",
      },
      {
        label: "Reclamos propios",
        value: String(nextClaims.length),
        detail: "Ultimos tickets cargados",
      },
      {
        label: "Documentos disponibles",
        value: String(nextDocuments.length),
        detail: "Reglamentos y liquidaciones visibles",
      },
      {
        label: "Visitas cargadas",
        value: String(nextVisits.length),
        detail: "Autorizaciones futuras vigentes",
      },
    ]);

    setAnnouncements((announcementsResult.data as Announcement[] | null) ?? []);
    setDocuments(nextDocuments);
    setSubscriptionCharge(nextSubscription);
    setActivity([
      ...nextReservations.map((item) => ({
        title: `Reserva ${new Date(item.fecha).toLocaleDateString("es-AR")}`,
        detail: `${item.hora_inicio.slice(0, 5)} a ${item.hora_fin.slice(0, 5)}`,
        status: item.estado,
      })),
      ...nextClaims.map((item) => ({
        title: item.titulo,
        detail: `Ticket del ${new Date(item.created_at).toLocaleDateString("es-AR")}`,
        status: item.estado,
      })),
    ].slice(0, 6));
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
        await loadOverview(data.session.user.id);
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

  const residentUnitCharge = calculateResidentUnitCharge(subscriptionCharge);
  const chargeTargetLabel = subscriptionCharge?.destino_cobro === "inquilino"
    ? "inquilinos"
    : subscriptionCharge?.destino_cobro === "todos"
      ? "todos los ocupantes"
      : "propietarios";

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Portal en vivo</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Actividad real de tu unidad</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Anuncios, documentos, reservas, reclamos y visitas tomados desde Supabase con el perfil autenticado.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}

      {loading ? <div className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando informacion real de residente.</p></div> : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}
          </div>
          <article className="role-card mt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Costo de plataforma</p>
                <h4 className="mt-3 text-2xl font-semibold text-slate-950">$ {residentUnitCharge.toLocaleString("es-AR")} por unidad</h4>
              </div>
              <span className="status-badge status-badge--neutral">{subscriptionCharge?.modalidad_cobro === "admin_absorbe" ? "Sin traslado" : "Configurado"}</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {subscriptionCharge?.modalidad_cobro === "admin_absorbe"
                ? "La administracion absorbe el costo del servicio sin trasladarlo a residentes."
                : `El consorcio publica un valor de lista de $ ${Number(subscriptionCharge?.precio_lista_por_unidad ?? 0).toLocaleString("es-AR")} por unidad y traslada este cargo a ${chargeTargetLabel}.`}
            </p>
          </article>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <article className="role-card lg:col-span-1">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Anuncios</p>
              <div className="mt-4 grid gap-3">
                {announcements.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay anuncios recientes.</p> : announcements.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><p className="mt-2 text-sm leading-7 text-slate-600">{item.contenido}</p></div>)}
              </div>
            </article>
            <article className="role-card lg:col-span-1">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Documentos</p>
              <div className="mt-4 grid gap-3">
                {documents.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay documentos visibles.</p> : documents.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><span className="status-badge status-badge--neutral">{item.tipo}</span></div><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.publicado_at).toLocaleDateString("es-AR")}</p></div>)}
              </div>
            </article>
            <article className="role-card lg:col-span-1">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Actividad</p>
              <div className="mt-4 grid gap-3">
                {activity.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay actividad para mostrar.</p> : activity.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={`${item.title}-${item.detail}`}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.title}</h4><span className="status-badge status-badge--neutral">{item.status}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.detail}</p></div>)}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}