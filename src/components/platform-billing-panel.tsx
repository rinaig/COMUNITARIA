"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRecord } from "@/lib/auth-types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Tenant = {
  id: string;
  nombre: string;
  cantidad_unidades: number;
};

type PlatformSettingsRow = {
  default_unit_price: number;
};

type SubscriptionRow = {
  id: string;
  consorcio_id: string;
  admin_id: string | null;
  plan: "base" | "barrio" | "premium";
  estado: "trial" | "activa" | "past_due" | "pausada" | "cancelada";
  precio_lista_por_unidad: number;
  unit_price_override: number | null;
  proximo_vencimiento: string | null;
  observaciones: string | null;
  ultimo_pago_at: string | null;
};

type PaymentRow = {
  id: string;
  suscripcion_id: string;
  consorcio_id: string;
  importe: number;
  estado: "pagado" | "pendiente" | "vencido" | "fallido";
  metodo: string | null;
  referencia: string | null;
  fecha_pago: string | null;
  nota: string | null;
  created_at: string;
};

const planOptions: SubscriptionRow["plan"][] = ["base", "barrio", "premium"];
const subscriptionStatusOptions: SubscriptionRow["estado"][] = ["trial", "activa", "past_due", "pausada", "cancelada"];

function getPaymentStatusLabel(status: PaymentRow["estado"]) {
  if (status === "pagado") {
    return "aprobado";
  }

  if (status === "fallido") {
    return "rechazado";
  }

  if (status === "vencido") {
    return "vencido";
  }

  return "pendiente";
}

function getPaymentStatusClassName(status: PaymentRow["estado"]) {
  if (status === "pagado") {
    return "status-badge status-badge--success";
  }

  if (status === "fallido") {
    return "rounded-full bg-rose-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-rose-700";
  }

  if (status === "vencido") {
    return "status-badge status-badge--warning";
  }

  return "rounded-full bg-amber-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-700";
}

function getEffectiveUnitPrice(subscription: SubscriptionRow | null, defaultUnitPrice: string) {
  if (!subscription) {
    return Number(defaultUnitPrice || 0);
  }

  return Number(subscription.unit_price_override ?? subscription.precio_lista_por_unidad ?? Number(defaultUnitPrice || 0));
}

export function PlatformBillingPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [savingGlobalPrice, setSavingGlobalPrice] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [reviewingPaymentId, setReviewingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [defaultUnitPrice, setDefaultUnitPrice] = useState("0");
  const [plan, setPlan] = useState<SubscriptionRow["plan"]>("base");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionRow["estado"]>("trial");
  const [nextDueDate, setNextDueDate] = useState("");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");
  const [specialUnitPrice, setSpecialUnitPrice] = useState("");

  const syncSelectedSubscriptionForm = useCallback((subscription: SubscriptionRow | null) => {
    setPlan(subscription?.plan ?? "base");
    setSubscriptionStatus(subscription?.estado ?? "trial");
    setNextDueDate(subscription?.proximo_vencimiento ?? "");
    setSubscriptionNotes(subscription?.observaciones ?? "");
    setSpecialUnitPrice(subscription?.unit_price_override == null ? "" : String(subscription.unit_price_override));
  }, []);

  const loadData = useCallback(async (userId: string) => {
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
      setLoading(false);
      return;
    }

    const [settingsResult, tenantsResult, subscriptionsResult, paymentsResult] = await Promise.all([
      supabase.from("platform_settings").select("default_unit_price").eq("id", true).maybeSingle(),
      supabase.from("consorcios").select("id, nombre, cantidad_unidades").order("nombre", { ascending: true }),
      supabase.from("consorcio_suscripciones").select("id, consorcio_id, admin_id, plan, estado, precio_lista_por_unidad, unit_price_override, proximo_vencimiento, observaciones, ultimo_pago_at").order("created_at", { ascending: false }),
      supabase.from("admin_payment_events").select("id, suscripcion_id, consorcio_id, importe, estado, metodo, referencia, fecha_pago, nota, created_at").order("created_at", { ascending: false }).limit(30),
    ]);

    const firstError = [settingsResult.error, tenantsResult.error, subscriptionsResult.error, paymentsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const settings = (settingsResult.data as PlatformSettingsRow | null) ?? { default_unit_price: 0 };
    const nextTenants = (tenantsResult.data as Tenant[] | null) ?? [];
    const nextSubscriptions = (subscriptionsResult.data as SubscriptionRow[] | null) ?? [];

    setDefaultUnitPrice(String(settings.default_unit_price ?? 0));
    setTenants(nextTenants);
    setSubscriptions(nextSubscriptions);
    setPayments((paymentsResult.data as PaymentRow[] | null) ?? []);

    const nextSelectedTenantId = selectedTenantId || nextTenants[0]?.id || "";
    setSelectedTenantId(nextSelectedTenantId);
    syncSelectedSubscriptionForm(nextSubscriptions.find((item) => item.consorcio_id === nextSelectedTenantId) ?? null);

    setLoading(false);
  }, [selectedTenantId, supabase, syncSelectedSubscriptionForm]);

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
        await loadData(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadData, supabase]);

  const selectedSubscription = subscriptions.find((item) => item.consorcio_id === selectedTenantId) ?? null;
  const selectedTenant = tenants.find((item) => item.id === selectedTenantId) ?? null;
  const effectiveUnitPrice = getEffectiveUnitPrice(selectedSubscription, defaultUnitPrice);
  const estimatedMonthly = effectiveUnitPrice * Number(selectedTenant?.cantidad_unidades ?? 0);

  function handleTenantSelection(nextTenantId: string) {
    setSelectedTenantId(nextTenantId);
    syncSelectedSubscriptionForm(subscriptions.find((item) => item.consorcio_id === nextTenantId) ?? null);
  }

  async function handleDefaultUnitPriceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    setSavingGlobalPrice(true);
    setError("");
    setMessage("");

    const { error: saveError } = await supabase
      .from("platform_settings")
      .update({ default_unit_price: Number(defaultUnitPrice || 0) })
      .eq("id", true);

    if (saveError) {
      setError(saveError.message);
      setSavingGlobalPrice(false);
      return;
    }

    const subscriptionIdsWithoutOverride = subscriptions.filter((item) => item.unit_price_override == null).map((item) => item.id);
    if (subscriptionIdsWithoutOverride.length > 0) {
      await supabase
        .from("consorcio_suscripciones")
        .update({ precio_lista_por_unidad: Number(defaultUnitPrice || 0) })
        .in("id", subscriptionIdsWithoutOverride);
    }

    setMessage("Precio general por unidad actualizado.");
    if (session?.user) {
      await loadData(session.user.id);
    }
    setSavingGlobalPrice(false);
  }

  async function handleSubscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedTenantId) {
      return;
    }

    setSavingSubscription(true);
    setError("");
    setMessage("");

    const overrideValue = specialUnitPrice.trim() === "" ? null : Number(specialUnitPrice);
    const nextEffectiveUnitPrice = overrideValue ?? Number(defaultUnitPrice || 0);
    const payload = {
      consorcio_id: selectedTenantId,
      admin_id: selectedSubscription?.admin_id ?? null,
      plan,
      estado: subscriptionStatus,
      precio_lista_por_unidad: Number(defaultUnitPrice || 0),
      unit_price_override: overrideValue,
      monto_mensual: nextEffectiveUnitPrice * Number(selectedTenant?.cantidad_unidades ?? 0),
      proximo_vencimiento: nextDueDate || null,
      observaciones: subscriptionNotes || null,
    };

    const query = selectedSubscription
      ? supabase.from("consorcio_suscripciones").update(payload).eq("id", selectedSubscription.id)
      : supabase.from("consorcio_suscripciones").insert(payload);

    const { error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setSavingSubscription(false);
      return;
    }

    setMessage("Configuracion especial guardada.");
    if (session?.user) {
      await loadData(session.user.id);
    }
    setSavingSubscription(false);
  }

  async function handlePaymentReview(payment: PaymentRow, nextStatus: PaymentRow["estado"]) {
    if (!supabase) {
      return;
    }

    setReviewingPaymentId(payment.id);
    setError("");
    setMessage("");

    const { error: paymentError } = await supabase
      .from("admin_payment_events")
      .update({ estado: nextStatus })
      .eq("id", payment.id);

    if (paymentError) {
      setError(paymentError.message);
      setReviewingPaymentId(null);
      return;
    }

    if (nextStatus === "pagado") {
      await supabase
        .from("consorcio_suscripciones")
        .update({ estado: "activa", ultimo_pago_at: payment.fecha_pago ?? new Date().toISOString() })
        .eq("id", payment.suscripcion_id);
    }

    if (nextStatus === "fallido") {
      await supabase
        .from("consorcio_suscripciones")
        .update({ estado: "past_due" })
        .eq("id", payment.suscripcion_id);
    }

    setMessage(nextStatus === "pagado" ? "Transferencia aprobada y acceso habilitado." : nextStatus === "fallido" ? "Transferencia rechazada." : "Transferencia marcada como pendiente.");
    if (session?.user) {
      await loadData(session.user.id);
    }
    setReviewingPaymentId(null);
  }

  if (!configured || profile?.rol !== "superadmin") {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-6 lg:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Facturacion base</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Suscripciones y pagos de administradores</h3>
        </div>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <form className="role-card grid gap-4" onSubmit={handleDefaultUnitPriceSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Precio general por unidad</p>
            <label><span className="field-label">Monto general</span><input className="field mt-2" min="0" onChange={(event) => setDefaultUnitPrice(event.target.value)} required step="0.01" type="number" value={defaultUnitPrice} /></label>
            <button className="button-primary" disabled={savingGlobalPrice || loading} type="submit">{savingGlobalPrice ? "Guardando..." : "Guardar monto general"}</button>
          </form>

          <form className="role-card grid gap-4" onSubmit={handleSubscriptionSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Plan especial por consorcio</p>
            <label><span className="field-label">Consorcio</span><select className="field-select mt-2" onChange={(event) => handleTenantSelection(event.target.value)} value={selectedTenantId}>{tenants.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label><span className="field-label">Plan</span><select className="field-select mt-2" onChange={(event) => setPlan(event.target.value as SubscriptionRow["plan"])} value={plan}>{planOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Estado comercial</span><select className="field-select mt-2" onChange={(event) => setSubscriptionStatus(event.target.value as SubscriptionRow["estado"])} value={subscriptionStatus}>{subscriptionStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Monto general vigente</span><input className="field mt-2" disabled value={`$ ${Number(defaultUnitPrice || 0).toLocaleString("es-AR")}`} /></label>
            <label><span className="field-label">Monto especial por unidad</span><input className="field mt-2" min="0" onChange={(event) => setSpecialUnitPrice(event.target.value)} placeholder="Dejar vacio para usar el general" step="0.01" type="number" value={specialUnitPrice} /></label>
            <label><span className="field-label">Proximo vencimiento</span><input className="field mt-2" onChange={(event) => setNextDueDate(event.target.value)} type="date" value={nextDueDate} /></label>
            <label><span className="field-label">Observaciones</span><textarea className="field-textarea mt-2" onChange={(event) => setSubscriptionNotes(event.target.value)} value={subscriptionNotes} /></label>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Aplicacion del precio</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">$ {effectiveUnitPrice.toLocaleString("es-AR")}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">{specialUnitPrice.trim() === "" ? "Usa el monto general." : "Usa un plan especial para este consorcio."} Total estimado: $ {estimatedMonthly.toLocaleString("es-AR")}.</p>
            </div>
            <button className="button-primary" disabled={savingSubscription || loading} type="submit">{savingSubscription ? "Guardando..." : "Guardar plan especial"}</button>
          </form>
        </div>

        <div className="grid gap-6">
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado por consorcio</p>
            <div className="mt-4 grid gap-3">
              {loading ? <p className="text-sm leading-7 text-slate-600">Cargando suscripciones.</p> : subscriptions.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay suscripciones registradas.</p> : subscriptions.map((item) => {
                const tenant = tenants.find((tenantItem) => tenantItem.id === item.consorcio_id);
                const itemEffectiveUnitPrice = Number(item.unit_price_override ?? item.precio_lista_por_unidad ?? 0);
                const itemMonthly = itemEffectiveUnitPrice * Number(tenant?.cantidad_unidades ?? 0);
                return <button className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-colors hover:border-slate-300" key={item.id} onClick={() => handleTenantSelection(item.consorcio_id)} type="button"><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{tenant?.nombre ?? item.consorcio_id}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">Plan {item.plan} · $ {itemMonthly.toLocaleString("es-AR")}/mes</p><p className="mt-1 text-sm leading-7 text-slate-600">$ {itemEffectiveUnitPrice.toLocaleString("es-AR")} por unidad · {item.unit_price_override == null ? "General" : "Especial"}</p></button>;
              })}
            </div>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Transferencias reportadas</p>
            <div className="mt-4 grid gap-3">
              {payments.length === 0 ? <p className="text-sm leading-7 text-slate-600">Aun no hay transferencias reportadas por administradores.</p> : payments.map((item) => {
                const tenant = tenants.find((tenantItem) => tenantItem.id === item.consorcio_id);
                const busy = reviewingPaymentId === item.id;
                return <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="text-lg font-semibold text-slate-950">{tenant?.nombre ?? item.consorcio_id}</h4><p className="mt-1 text-sm leading-7 text-slate-600">Transferencia {item.fecha_pago ? new Date(item.fecha_pago).toLocaleDateString("es-AR") : new Date(item.created_at).toLocaleDateString("es-AR")}</p></div><span className={getPaymentStatusClassName(item.estado)}>{getPaymentStatusLabel(item.estado)}</span></div><div className="mt-4 grid gap-2 text-sm leading-7 text-slate-600 sm:grid-cols-3"><p><span className="font-semibold text-slate-900">Monto:</span> $ {Number(item.importe).toLocaleString("es-AR")}</p><p><span className="font-semibold text-slate-900">Metodo:</span> {item.metodo ?? "Transferencia"}</p><p><span className="font-semibold text-slate-900">Referencia:</span> {item.referencia ?? "Sin referencia"}</p></div>{item.nota ? <p className="mt-2 text-sm leading-7 text-slate-600">{item.nota}</p> : null}<div className="mt-4 flex flex-wrap gap-3"><button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-60" disabled={busy} onClick={() => void handlePaymentReview(item, "pagado")} title="Aprobar" type="button">✓</button><button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700 transition hover:bg-amber-200 disabled:opacity-60" disabled={busy} onClick={() => void handlePaymentReview(item, "pendiente")} title="Pendiente" type="button">!</button><button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-xl text-rose-700 transition hover:bg-rose-200 disabled:opacity-60" disabled={busy} onClick={() => void handlePaymentReview(item, "fallido")} title="Rechazar" type="button">×</button></div></div>;
              })}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}