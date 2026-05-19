"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import type { ProfileRecord } from "@/lib/auth-types";
import { PlatformBillingPanel } from "@/components/platform-billing-panel";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Tenant = {
  id: string;
  nombre: string;
  direccion: string;
  cantidad_unidades: number;
};

type AdminProfile = {
  id: string;
  consorcio_id: string | null;
  nombre: string;
  apellido: string;
  email: string;
  estado: ProfileRecord["estado"];
};

type AggregateProfile = {
  consorcio_id: string | null;
  rol: ProfileRecord["rol"];
  estado: ProfileRecord["estado"];
};

type SubscriptionRow = {
  consorcio_id: string;
  plan: "base" | "barrio" | "premium";
  estado: "trial" | "activa" | "past_due" | "pausada" | "cancelada";
  precio_lista_por_unidad: number;
  unit_price_override: number | null;
};

type PlatformRow = {
  id: string;
  adminName: string;
  email: string;
  consorcio: string;
  city: string;
  plan: string;
  usersCount: number;
  adminStatus: string;
  commercialStatus: string;
  unitCount: number;
  unitPrice: number;
  specialUnitPrice: number | null;
};

type SummaryMetric = {
  label: string;
  value: number;
  tone: "blue" | "green" | "amber" | "red";
};

function getBarClassName(tone: SummaryMetric["tone"]) {
  if (tone === "green") {
    return "bg-emerald-500";
  }

  if (tone === "amber") {
    return "bg-amber-500";
  }

  if (tone === "red") {
    return "bg-rose-500";
  }

  return "bg-blue-700";
}

function createWorksheetData(rows: PlatformRow[]) {
  return rows.map((item) => ({
    Administrador: item.adminName,
    Email: item.email,
    Consorcio: item.consorcio,
    Ubicacion: item.city,
    Plan: item.plan,
    "Estado comercial": item.commercialStatus,
    "Estado admin": item.adminStatus,
    Usuarios: item.usersCount,
    Unidades: item.unitCount,
    "Precio unidad general": item.unitPrice,
    "Precio unidad especial": item.specialUnitPrice ?? "",
  }));
}

export function PlatformLiveConsole() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState({
    activeConsorcios: 0,
    activeAdmins: 0,
    pendingAdmins: 0,
    totalUsers: 0,
    activeSubscriptions: 0,
    trialSubscriptions: 0,
  });
  const [adminStatusSummary, setAdminStatusSummary] = useState<SummaryMetric[]>([]);
  const [subscriptionStatusSummary, setSubscriptionStatusSummary] = useState<SummaryMetric[]>([]);
  const [rows, setRows] = useState<PlatformRow[]>([]);

  const loadRealConsole = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, nombre, apellido, telefono, dni, unidad_funcional, rol, estado, consorcio_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const nextProfile = (profileData as ProfileRecord | null) ?? null;
    setProfile(nextProfile);

    if (!nextProfile || nextProfile.rol !== "superadmin") {
      setRows([]);
      setLoading(false);
      return;
    }

    const [tenantsResult, adminsResult, aggregateProfilesResult, subscriptionsResult] = await Promise.all([
      supabase.from("consorcios").select("id, nombre, direccion, cantidad_unidades").order("nombre", { ascending: true }),
      supabase.from("profiles").select("id, consorcio_id, nombre, apellido, email, estado").eq("rol", "admin").order("apellido", { ascending: true }),
      supabase.from("profiles").select("consorcio_id, rol, estado").not("consorcio_id", "is", null),
      supabase.from("consorcio_suscripciones").select("consorcio_id, plan, estado, precio_lista_por_unidad, unit_price_override"),
    ]);

    const firstError = [tenantsResult.error, adminsResult.error, aggregateProfilesResult.error, subscriptionsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const tenants = ((tenantsResult.data as Tenant[] | null) ?? []).reduce<Record<string, Tenant>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
    const admins = (adminsResult.data as AdminProfile[] | null) ?? [];
    const aggregateProfiles = (aggregateProfilesResult.data as AggregateProfile[] | null) ?? [];
    const subscriptions = ((subscriptionsResult.data as SubscriptionRow[] | null) ?? []).reduce<Record<string, SubscriptionRow>>((acc, item) => {
      acc[item.consorcio_id] = item;
      return acc;
    }, {});

    const countsByTenant = aggregateProfiles.reduce<Record<string, { users: number }>>((acc, item) => {
      if (!item.consorcio_id) {
        return acc;
      }

      acc[item.consorcio_id] ??= { users: 0 };
      acc[item.consorcio_id].users += 1;
      return acc;
    }, {});

    const nextRows = admins.map((item) => {
      const tenant = item.consorcio_id ? tenants[item.consorcio_id] : undefined;
      const subscription = item.consorcio_id ? subscriptions[item.consorcio_id] : undefined;
      const counts = item.consorcio_id ? countsByTenant[item.consorcio_id] : undefined;

      return {
        id: item.id,
        adminName: `${item.nombre} ${item.apellido}`.trim(),
        email: item.email,
        consorcio: tenant?.nombre ?? "Sin consorcio",
        city: tenant?.direccion?.split(",").slice(-1)[0]?.trim() ?? "-",
        plan: subscription?.plan ?? "sin plan",
        usersCount: counts?.users ?? 0,
        adminStatus: item.estado,
        commercialStatus: subscription?.estado ?? "sin suscripcion",
        unitCount: tenant?.cantidad_unidades ?? 0,
        unitPrice: Number(subscription?.precio_lista_por_unidad ?? 0),
        specialUnitPrice: subscription?.unit_price_override ?? null,
      };
    });

    const activeSubscriptions = Object.values(subscriptions).filter((item) => item.estado === "activa").length;
    const trialSubscriptions = Object.values(subscriptions).filter((item) => item.estado === "trial").length;

    setMetrics({
      activeConsorcios: Object.keys(tenants).length,
      activeAdmins: admins.filter((item) => item.estado === "activo").length,
      pendingAdmins: admins.filter((item) => item.estado === "pendiente").length,
      totalUsers: aggregateProfiles.length,
      activeSubscriptions,
      trialSubscriptions,
    });

    setAdminStatusSummary([
      { label: "Administradores activos", value: admins.filter((item) => item.estado === "activo").length, tone: "green" },
      { label: "Administradores pendientes", value: admins.filter((item) => item.estado === "pendiente").length, tone: "amber" },
      { label: "Administradores rechazados", value: admins.filter((item) => item.estado === "rechazado").length, tone: "red" },
    ]);

    setSubscriptionStatusSummary([
      { label: "Suscriptos", value: activeSubscriptions, tone: "green" },
      { label: "En prueba", value: trialSubscriptions, tone: "blue" },
      { label: "Con deuda", value: Object.values(subscriptions).filter((item) => item.estado === "past_due").length, tone: "amber" },
      { label: "Pausados o cancelados", value: Object.values(subscriptions).filter((item) => item.estado === "pausada" || item.estado === "cancelada").length, tone: "red" },
    ]);

    setRows(nextRows);
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
        await loadRealConsole(data.session.user.id);
      } else {
        setRows([]);
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadRealConsole, supabase]);

  function downloadAdminsXlsx() {
    const worksheet = XLSX.utils.json_to_sheet(createWorksheetData(rows));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Administradores");
    XLSX.writeFile(workbook, "administradores-comunitaria.xlsx");
  }

  const isSuperadmin = profile?.rol === "superadmin";
  const maxAdminSummary = Math.max(...adminStatusSummary.map((item) => item.value), 1);
  const maxSubscriptionSummary = Math.max(...subscriptionStatusSummary.map((item) => item.value), 1);

  return (
    <>
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="glass-panel rounded-[2rem] p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Consola interna real</p>
              <h2 className="mt-4 max-w-4xl text-3xl font-semibold tracking-[-0.05em] text-slate-950 lg:text-5xl">
                Vista de plataforma para operar Comunitaria.
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="button-secondary" onClick={downloadAdminsXlsx} type="button">
                Descargar administradores XLSX
              </button>
            </div>
          </div>

          {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
          {!configured ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Supabase no esta configurado.</p></article> : null}
          {configured && session && !isSuperadmin ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">La sesion actual no tiene permisos de SuperUser.</p></article> : null}
          {loading ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando consola de plataforma.</p></article> : null}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article className="metric-card"><span>Consorcios</span><strong>{metrics.activeConsorcios}</strong><small>Base total conectada</small></article>
            <article className="metric-card"><span>Admins activos</span><strong>{metrics.activeAdmins}</strong><small>{metrics.pendingAdmins} pendientes</small></article>
            <article className="metric-card"><span>Usuarios agregados</span><strong>{metrics.totalUsers}</strong><small>Conteo total del sistema</small></article>
            <article className="metric-card"><span>Suscripciones activas</span><strong>{metrics.activeSubscriptions}</strong><small>Operando con aprobacion</small></article>
            <article className="metric-card"><span>Periodos de prueba</span><strong>{metrics.trialSubscriptions}</strong><small>Seguimiento comercial</small></article>
            <article className="metric-card"><span>Estado plataforma</span><strong>{isSuperadmin ? "Conectada" : "Restringida"}</strong><small>Vista interna</small></article>
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-6 lg:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Reportes</p>
          <div className="mt-6 grid gap-6">
            <div className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado de administradores</p>
              <div className="mt-4 grid gap-4">
                {adminStatusSummary.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                      <span>{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200">
                      <div className={`h-3 rounded-full ${getBarClassName(item.tone)}`} style={{ width: `${Math.max((item.value / maxAdminSummary) * 100, item.value > 0 ? 14 : 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado comercial</p>
              <div className="mt-4 grid gap-4">
                {subscriptionStatusSummary.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                      <span>{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200">
                      <div className={`h-3 rounded-full ${getBarClassName(item.tone)}`} style={{ width: `${Math.max((item.value / maxSubscriptionSummary) * 100, item.value > 0 ? 14 : 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 glass-panel rounded-[2rem] p-6 lg:p-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Administradores</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Seguimiento agregado por consorcio y administrador</h3>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white/90">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr_0.7fr_0.7fr_0.9fr_0.8fr_0.8fr] gap-4 border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              <span>Administrador</span>
              <span>Consorcio</span>
              <span>Ubicacion</span>
              <span>Plan</span>
              <span>Usuarios</span>
              <span>Estado comercial</span>
              <span>Precio unidad</span>
              <span>Estado</span>
            </div>
            {rows.map((item) => (
              <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr_0.7fr_0.7fr_0.9fr_0.8fr_0.8fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700 last:border-b-0" key={item.id}>
                <div>
                  <p className="font-semibold text-slate-900">{item.adminName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.email}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{item.consorcio}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.unitCount} unidades</p>
                </div>
                <div>{item.city}</div>
                <div className="font-semibold text-slate-900">{item.plan}</div>
                <div>{item.usersCount}</div>
                <div><span className="status-badge status-badge--neutral">{item.commercialStatus}</span></div>
                <div>
                  <p className="font-semibold text-slate-900">$ {(item.specialUnitPrice ?? item.unitPrice).toLocaleString("es-AR")}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.specialUnitPrice == null ? "General" : `Especial · base ${item.unitPrice.toLocaleString("es-AR")}`}</p>
                </div>
                <div><span className="status-badge status-badge--neutral">{item.adminStatus}</span></div>
              </div>
            ))}
            {!rows.length && !loading ? <div className="px-5 py-6 text-sm leading-7 text-slate-600">No hay administradores visibles para la cuenta actual.</div> : null}
          </div>
        </div>
      </section>

      <PlatformBillingPanel />
    </>
  );
}