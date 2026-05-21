"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import type { ProfileRecord } from "@/lib/auth-types";
import { CollapsiblePanelSection } from "@/components/collapsible-panel-section";
import { PlatformBillingPanel } from "@/components/platform-billing-panel";
import { DEMO_PORTAL_STORAGE_KEY, createDemoPortalSession, type DemoRole } from "@/lib/demo-mode";
import { roleLabels } from "@/lib/domain";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { getCompatIssueMessage, loadPlatformAuditEventsCompat, type PlatformAuditEventCompatRow } from "@/lib/platform-schema-compat";

type Tenant = {
  id: string;
  nombre: string;
  direccion: string;
  cantidad_unidades: number;
  trial_unit_limit: number;
  trial_guard_post_limit: number;
};

type AdminProfile = {
  id: string;
  consorcio_id: string | null;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  estado: ProfileRecord["estado"];
};

type AggregateProfile = {
  consorcio_id: string | null;
  rol: ProfileRecord["rol"];
  estado: ProfileRecord["estado"];
};

type SubscriptionRow = {
  id: string;
  consorcio_id: string;
  plan: "base" | "barrio" | "premium";
  estado: "trial" | "activa" | "past_due" | "pausada" | "cancelada";
  precio_lista_por_unidad: number;
  unit_price_override: number | null;
  trial_expires_at: string | null;
};

type PaymentSummaryRow = {
  suscripcion_id: string;
  consorcio_id: string;
  estado: "pagado" | "pendiente" | "vencido" | "fallido";
};

type PlatformRow = {
  id: string;
  adminName: string;
  email: string;
  phone: string | null;
  consorcio: string;
  city: string;
  plan: string;
  usersCount: number;
  adminStatus: string;
  commercialStatus: string;
  unitCount: number;
  trialUnitLimit: number;
  trialGuardPostLimit: number;
  unitPrice: number;
  specialUnitPrice: number | null;
};

type ExpiredTrialLead = {
  id: string;
  adminName: string;
  email: string;
  phone: string | null;
  consorcio: string;
  trialExpiresAt: string;
  trialUnitLimit: number;
  trialGuardPostLimit: number;
};

type AuditEventRow = PlatformAuditEventCompatRow;

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
    Telefono: item.phone ?? "",
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
  const [expiredTrialLeads, setExpiredTrialLeads] = useState<ExpiredTrialLead[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [auditNotice, setAuditNotice] = useState("");
  const [commercialNotice, setCommercialNotice] = useState("");
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});

  const loadRealConsole = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");
    setAuditNotice("");
    setCommercialNotice("");

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
      setExpiredTrialLeads([]);
      setLoading(false);
      return;
    }

    const [tenantsResult, adminsResult, aggregateProfilesResult, subscriptionsResult, paymentsResult, auditCompat] = await Promise.allSettled([
      supabase.from("consorcios").select("id, nombre, direccion, cantidad_unidades, trial_unit_limit, trial_guard_post_limit").order("nombre", { ascending: true }),
      supabase.from("profiles").select("id, consorcio_id, nombre, apellido, email, telefono, estado").eq("rol", "admin").order("apellido", { ascending: true }),
      supabase.from("profiles").select("consorcio_id, rol, estado").not("consorcio_id", "is", null),
      supabase.from("consorcio_suscripciones").select("id, consorcio_id, plan, estado, precio_lista_por_unidad, unit_price_override, trial_expires_at"),
      supabase.from("admin_payment_events").select("suscripcion_id, consorcio_id, estado"),
      loadPlatformAuditEventsCompat(supabase),
    ]);

    if (tenantsResult.status !== "fulfilled" || tenantsResult.value.error) {
      setError(getCompatIssueMessage("Consorcios", tenantsResult.status === "fulfilled" ? tenantsResult.value.error : tenantsResult.reason));
      setLoading(false);
      return;
    }

    if (adminsResult.status !== "fulfilled" || adminsResult.value.error) {
      setError(getCompatIssueMessage("Administradores", adminsResult.status === "fulfilled" ? adminsResult.value.error : adminsResult.reason));
      setLoading(false);
      return;
    }

    if (aggregateProfilesResult.status !== "fulfilled" || aggregateProfilesResult.value.error) {
      setError(getCompatIssueMessage("Usuarios", aggregateProfilesResult.status === "fulfilled" ? aggregateProfilesResult.value.error : aggregateProfilesResult.reason));
      setLoading(false);
      return;
    }

    const warnings: string[] = [];
    const tenants = ((tenantsResult.value.data as Tenant[] | null) ?? []).reduce<Record<string, Tenant>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
    const admins = (adminsResult.value.data as AdminProfile[] | null) ?? [];
    const aggregateProfiles = (aggregateProfilesResult.value.data as AggregateProfile[] | null) ?? [];
    const subscriptions = subscriptionsResult.status === "fulfilled" && !subscriptionsResult.value.error
      ? ((subscriptionsResult.value.data as SubscriptionRow[] | null) ?? []).reduce<Record<string, SubscriptionRow>>((acc, item) => {
        acc[item.consorcio_id] = item;
        return acc;
      }, {})
      : {};
    const paidSubscriptionIds = new Set(
      paymentsResult.status === "fulfilled" && !paymentsResult.value.error
        ? ((paymentsResult.value.data as PaymentSummaryRow[] | null) ?? [])
          .filter((item) => item.estado === "pagado")
          .map((item) => item.suscripcion_id)
        : [],
    );
    const nextAuditEvents = auditCompat.status === "fulfilled" ? auditCompat.value.data : [];

    if (subscriptionsResult.status !== "fulfilled" || subscriptionsResult.value.error) {
      warnings.push(getCompatIssueMessage("Suscripciones", subscriptionsResult.status === "fulfilled" ? subscriptionsResult.value.error : subscriptionsResult.reason));
    }

    if (paymentsResult.status !== "fulfilled" || paymentsResult.value.error) {
      warnings.push(getCompatIssueMessage("Pagos", paymentsResult.status === "fulfilled" ? paymentsResult.value.error : paymentsResult.reason));
    }

    if (auditCompat.status !== "fulfilled") {
      warnings.push(getCompatIssueMessage("Auditoria", auditCompat.reason));
    } else if (auditCompat.value.error) {
      warnings.push(getCompatIssueMessage("Auditoria", auditCompat.value.error));
    }

    if (warnings.length > 0) {
      setCommercialNotice(warnings.join(" "));
    }

    const nextTenantNames = Object.values(tenants).reduce<Record<string, string>>((acc, item) => {
      acc[item.id] = item.nombre;
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
        phone: item.telefono,
        consorcio: tenant?.nombre ?? "Sin consorcio",
        city: tenant?.direccion?.split(",").slice(-1)[0]?.trim() ?? "-",
        plan: subscription?.plan ?? "sin plan",
        usersCount: counts?.users ?? 0,
        adminStatus: item.estado,
        commercialStatus: subscription?.estado ?? "sin suscripcion",
        unitCount: tenant?.cantidad_unidades ?? 0,
        trialUnitLimit: tenant?.trial_unit_limit ?? 3,
        trialGuardPostLimit: tenant?.trial_guard_post_limit ?? 1,
        unitPrice: Number(subscription?.precio_lista_por_unidad ?? 0),
        specialUnitPrice: subscription?.unit_price_override ?? null,
      } satisfies PlatformRow;
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

    const now = Date.now();
    const nextExpiredTrialLeads = admins
      .map((item) => {
        const subscription = item.consorcio_id ? subscriptions[item.consorcio_id] : null;
        const tenant = item.consorcio_id ? tenants[item.consorcio_id] : null;

        if (!subscription || subscription.estado !== "trial" || !subscription.trial_expires_at) {
          return null;
        }

        const expiresAt = new Date(subscription.trial_expires_at).getTime();
        if (Number.isNaN(expiresAt) || expiresAt >= now || paidSubscriptionIds.has(subscription.id)) {
          return null;
        }

        return {
          id: item.id,
          adminName: `${item.nombre} ${item.apellido}`.trim(),
          email: item.email,
          phone: item.telefono,
          consorcio: tenant?.nombre ?? "Sin consorcio",
          trialExpiresAt: subscription.trial_expires_at,
          trialUnitLimit: tenant?.trial_unit_limit ?? 3,
          trialGuardPostLimit: tenant?.trial_guard_post_limit ?? 1,
        } satisfies ExpiredTrialLead;
      })
      .filter((item): item is ExpiredTrialLead => Boolean(item))
      .sort((left, right) => new Date(left.trialExpiresAt).getTime() - new Date(right.trialExpiresAt).getTime());

    setExpiredTrialLeads(nextExpiredTrialLeads);
    setAuditEvents(nextAuditEvents);
    setAuditNotice(auditCompat.status === "fulfilled" ? (auditCompat.value.warning ?? "") : "");
    setTenantNames(nextTenantNames);
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
        setExpiredTrialLeads([]);
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

  function primeDemoPortal(role: DemoRole) {
    const demoSession = createDemoPortalSession(role);
    window.localStorage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(demoSession));
  }

  const isSuperadmin = profile?.rol === "superadmin";
  const maxAdminSummary = Math.max(...adminStatusSummary.map((item) => item.value), 1);
  const maxSubscriptionSummary = Math.max(...subscriptionStatusSummary.map((item) => item.value), 1);

  return (
    <>
      <CollapsiblePanelSection actions={<button className="button-secondary" onClick={downloadAdminsXlsx} type="button">Descargar administradores XLSX</button>} defaultOpen eyebrow="Panel ejecutivo" subtitle="Vista concentrada de la plataforma para revisar actividad, abrir demos por rol y seguir el estado general del negocio sin navegar una pagina larga." title="SuperUser · panorama general de Comunitaria">
          {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
          {commercialNotice ? <article className="role-card mt-6 border-slate-200 bg-slate-50/80"><p className="text-sm font-semibold text-slate-700">Facturacion comercial</p><p className="mt-2 text-sm leading-7 text-slate-600">{commercialNotice}</p></article> : null}
          {!configured ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Supabase no esta configurado.</p></article> : null}
          {configured && session && !isSuperadmin ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">La sesion actual no tiene permisos de SuperUser.</p></article> : null}
          {loading ? <article className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando consola de plataforma.</p></article> : null}

          <article className="role-card mt-6 border-sky-200 bg-sky-50/80">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-900">Demos por perfil</p>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-sky-900">Desde SuperUser ya puedes abrir un showcase local por perfil para presentar modulos sin tocar sesiones productivas ni depender de datos reales del consorcio.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {(["admin", "residente", "seguridad"] as DemoRole[]).map((item) => (
                <Link className="button-secondary" href={`/portal/demo/${item}`} key={item} onClick={() => primeDemoPortal(item)}>
                  Abrir demo {roleLabels[item]}
                </Link>
              ))}
            </div>
          </article>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article className="metric-card"><span>Consorcios</span><strong>{metrics.activeConsorcios}</strong><small>Base total conectada</small></article>
            <article className="metric-card"><span>Admins activos</span><strong>{metrics.activeAdmins}</strong><small>{metrics.pendingAdmins} pendientes</small></article>
            <article className="metric-card"><span>Usuarios agregados</span><strong>{metrics.totalUsers}</strong><small>Conteo total del sistema</small></article>
            <article className="metric-card"><span>Suscripciones activas</span><strong>{metrics.activeSubscriptions}</strong><small>Operando con aprobacion</small></article>
            <article className="metric-card"><span>Periodos de prueba</span><strong>{metrics.trialSubscriptions}</strong><small>Seguimiento comercial</small></article>
            <article className="metric-card"><span>Pruebas vencidas sin pago</span><strong>{expiredTrialLeads.length}</strong><small>Accion comercial inmediata</small></article>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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
      </CollapsiblePanelSection>

      <CollapsiblePanelSection eyebrow="Administradores" title="Seguimiento agregado por consorcio y administrador">
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white/90">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[1.2fr_1.1fr_0.9fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr_0.8fr] gap-4 border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              <span>Administrador</span>
              <span>Consorcio</span>
              <span>Ubicacion</span>
              <span>Plan</span>
              <span>Usuarios</span>
              <span>Estado comercial</span>
              <span>Prueba</span>
              <span>Precio unidad</span>
              <span>Estado</span>
            </div>
            {rows.map((item) => (
              <div className="grid grid-cols-[1.2fr_1.1fr_0.9fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr_0.8fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700 last:border-b-0" key={item.id}>
                <div>
                  <p className="font-semibold text-slate-900">{item.adminName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.email}{item.phone ? ` · ${item.phone}` : ""}</p>
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
                  <p className="font-semibold text-slate-900">{item.trialUnitLimit} UF</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.trialGuardPostLimit} puestos</p>
                </div>
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
      </CollapsiblePanelSection>

      <CollapsiblePanelSection eyebrow="Seguimiento comercial" title="Administradores con prueba vencida sin pago">
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {expiredTrialLeads.length === 0 ? (
            <article className="role-card">
              <p className="text-sm leading-7 text-slate-600">No hay administradores en prueba vencida pendientes de gestion comercial.</p>
            </article>
          ) : (
            expiredTrialLeads.map((item) => (
              <article className="role-card" key={item.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{item.adminName}</p>
                    <p className="mt-1 text-sm leading-7 text-slate-600">{item.consorcio}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-rose-500">Prueba vencida el {new Date(item.trialExpiresAt).toLocaleDateString("es-AR")}</p>
                  </div>
                  <span className="rounded-full bg-rose-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-rose-700">Sin pago</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm leading-7 text-slate-600">
                  <p><span className="font-semibold text-slate-900">Email:</span> {item.email}</p>
                  <p><span className="font-semibold text-slate-900">Telefono:</span> {item.phone || "Sin telefono registrado"}</p>
                  <p><span className="font-semibold text-slate-900">Limites trial:</span> {item.trialUnitLimit} unidades y {item.trialGuardPostLimit} puestos</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a className="button-secondary" href={`mailto:${item.email}`}>Enviar mail</a>
                  {item.phone ? <a className="button-secondary" href={`tel:${item.phone}`}>Llamar</a> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </CollapsiblePanelSection>

      <CollapsiblePanelSection eyebrow="Auditoria" title="Eventos recientes de plataforma">
        <div className="mt-6 grid gap-3">
          {auditEvents.length === 0 ? (
            <article className="role-card">
              <p className="text-sm leading-7 text-slate-600">{auditNotice || "Todavia no hay eventos auditados para mostrar."}</p>
            </article>
          ) : (
            auditEvents.map((item) => {
              const tenantName = item.consorcio_id ? tenantNames[item.consorcio_id] ?? item.consorcio_id : "Plataforma";
              return (
                <article className="role-card" key={item.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{item.action}</p>
                      <p className="mt-1 text-sm leading-7 text-slate-600">{item.target_table}{item.target_id ? ` · ${item.target_id}` : ""}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{tenantName}</p>
                    </div>
                    <span className="status-badge status-badge--neutral">{new Date(item.created_at).toLocaleString("es-AR")}</span>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </CollapsiblePanelSection>

      <CollapsiblePanelSection defaultOpen eyebrow="Configuracion publica y facturacion" subtitle="Panel central para editar la portada publica, administrar suscripciones por consorcio y revisar transferencias reportadas sin dejar la consola de plataforma." title="Home, suscripciones y pagos de administradores">
        <PlatformBillingPanel />
      </CollapsiblePanelSection>
    </>
  );
}