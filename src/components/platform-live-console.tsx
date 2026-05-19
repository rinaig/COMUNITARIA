"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRecord } from "@/lib/auth-types";
import { PlatformBillingPanel } from "@/components/platform-billing-panel";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Tenant = {
  id: string;
  nombre: string;
  direccion: string;
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

type PlatformRow = {
  id: string;
  adminName: string;
  company: string;
  consorcio: string;
  city: string;
  plan: string;
  usersCount: number;
  status: string;
};

type SubscriptionRow = {
  consorcio_id: string;
  plan: "base" | "barrio" | "premium";
  estado: "trial" | "activa" | "past_due" | "pausada" | "cancelada";
};

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
    monthlyGrowth: "Sin actividad",
  });
  const [rows, setRows] = useState<PlatformRow[]>([]);

  const platformNotes = [
    "Esta consola es solo para el propietario de plataforma y no se publica en la web.",
    "Los datos se muestran de forma agregada por consorcio y administrador, sin exponer residentes individuales.",
    "La gestion comercial y de pagos se concentra en el panel de suscripciones y cobranzas.",
  ];

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
      supabase.from("consorcios").select("id, nombre, direccion").order("nombre", { ascending: true }),
      supabase.from("profiles").select("id, consorcio_id, nombre, apellido, email, estado").eq("rol", "admin").order("apellido", { ascending: true }),
      supabase.from("profiles").select("consorcio_id, rol, estado").not("consorcio_id", "is", null),
      supabase.from("consorcio_suscripciones").select("consorcio_id, plan, estado"),
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

    const countsByTenant = aggregateProfiles.reduce<Record<string, { users: number; pending: number }>>((acc, item) => {
      if (!item.consorcio_id) {
        return acc;
      }

      acc[item.consorcio_id] ??= { users: 0, pending: 0 };
      acc[item.consorcio_id].users += 1;

      if (item.estado === "pendiente") {
        acc[item.consorcio_id].pending += 1;
      }

      return acc;
    }, {});

    const nextRows = admins.map((item) => {
      const tenant = item.consorcio_id ? tenants[item.consorcio_id] : undefined;
      const counts = item.consorcio_id ? countsByTenant[item.consorcio_id] : undefined;

      return {
        id: item.id,
        adminName: `${item.nombre} ${item.apellido}`.trim(),
        company: item.email,
        consorcio: tenant?.nombre ?? "Sin consorcio",
        city: tenant?.direccion?.split(",").slice(-1)[0]?.trim() ?? "-",
        plan: subscriptions[item.consorcio_id ?? ""]?.plan ?? "sin plan",
        usersCount: counts?.users ?? 0,
        status: item.estado,
      };
    });

    setMetrics({
      activeConsorcios: Object.keys(tenants).length,
      activeAdmins: admins.filter((item) => item.estado === "activo").length,
      pendingAdmins: admins.filter((item) => item.estado === "pendiente").length,
      totalUsers: aggregateProfiles.length,
      monthlyGrowth: nextRows.length > 0 ? "Base real conectada" : "Sin actividad",
    });
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

  const isSuperadmin = profile?.rol === "superadmin";

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Consola interna real
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
            Vista de plataforma para operar Comunitaria sin exponer datos privados.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            Estas viendo administradores, consorcios y volumen agregado real desde Supabase. Los datos sensibles de residentes no se exponen en esta capa.
          </p>

          {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}

          {!configured ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Supabase no esta configurado. Esta consola requiere conexion real.</p></article> : null}
          {configured && session && !isSuperadmin ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">La sesion actual no tiene permisos de SuperUser.</p></article> : null}
          {loading ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando consola de plataforma.</p></article> : null}

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="metric-card">
              <span>Consorcios activos</span>
              <strong>{metrics.activeConsorcios}</strong>
              <small>Base agregada</small>
            </article>
            <article className="metric-card">
              <span>Administradores activos</span>
              <strong>{metrics.activeAdmins}</strong>
              <small>{metrics.pendingAdmins} onboarding pendientes</small>
            </article>
            <article className="metric-card">
              <span>Usuarios agregados</span>
              <strong>{metrics.totalUsers}</strong>
              <small>Solo conteo agregado</small>
            </article>
            <article className="metric-card">
              <span>Estado plataforma</span>
              <strong>{isSuperadmin ? "Conectada" : "Restringida"}</strong>
              <small>{metrics.monthlyGrowth}</small>
            </article>
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Operacion interna
          </p>
          <div className="mt-6 grid gap-4">
            {platformNotes.map((item) => (
              <article className="role-card" key={item}>
                <p className="text-base leading-7 text-slate-700">{item}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Cobranza y pagos</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              El siguiente bloque a conectar aca es suscripcion, pagos y estado comercial de cada administrador. La tabla ya quedo preparada para mostrarlo sin abrir informacion privada de sus usuarios.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-6 glass-panel rounded-[2rem] p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Administradores reales
            </p>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Seguimiento agregado por consorcio y administrador.
            </h3>
          </div>
          <Link className="button-secondary" href="/auth">
            Volver a mi acceso
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/90">
          <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr_0.8fr_0.7fr_0.7fr] gap-4 border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            <span>Administrador</span>
            <span>Consorcio</span>
            <span>Ubicacion</span>
            <span>Estado comercial</span>
            <span>Usuarios</span>
            <span>Estado</span>
          </div>
          {rows.map((item) => (
            <div
              className="grid grid-cols-[1.1fr_1.1fr_0.9fr_0.8fr_0.7fr_0.7fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700 last:border-b-0"
              key={item.id}
            >
              <div>
                <p className="font-semibold text-slate-900">{item.adminName}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.company}</p>
              </div>
              <div className="font-semibold text-slate-900">{item.consorcio}</div>
              <div>{item.city}</div>
              <div>{item.plan}</div>
              <div>{item.usersCount}</div>
              <div>
                <span className="status-badge status-badge--neutral">{item.status}</span>
              </div>
            </div>
          ))}
          {!rows.length && !loading ? (
            <div className="px-5 py-6 text-sm leading-7 text-slate-600">
              No hay administradores visibles para la cuenta actual.
            </div>
          ) : null}
        </div>
      </section>

      <PlatformBillingPanel />
    </>
  );
}