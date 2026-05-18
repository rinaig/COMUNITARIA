"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRecord } from "@/lib/auth-types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Tenant = {
  id: string;
  nombre: string;
};

type SubscriptionRow = {
  id: string;
  consorcio_id: string;
  admin_id: string | null;
  plan: "base" | "barrio" | "premium";
  estado: "trial" | "activa" | "past_due" | "pausada" | "cancelada";
  monto_mensual: number;
  precio_lista_por_unidad: number;
  modalidad_cobro: "admin_absorbe" | "monto_fijo_por_unidad" | "porcentaje_por_unidad";
  valor_cobro: number;
  destino_cobro: "propietario" | "inquilino" | "todos";
  proximo_vencimiento: string | null;
  ultimo_pago_at: string | null;
  observaciones: string | null;
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
  fecha_vencimiento: string | null;
  nota: string | null;
  created_at: string;
};

const planOptions: SubscriptionRow["plan"][] = ["base", "barrio", "premium"];
const subscriptionStatusOptions: SubscriptionRow["estado"][] = ["trial", "activa", "past_due", "pausada", "cancelada"];
const paymentStatusOptions: PaymentRow["estado"][] = ["pagado", "pendiente", "vencido", "fallido"];

function describeChargeMode(subscription: SubscriptionRow) {
  if (subscription.modalidad_cobro === "admin_absorbe") {
    return "Admin absorbe el costo";
  }

  if (subscription.modalidad_cobro === "monto_fijo_por_unidad") {
    return `$ ${Number(subscription.valor_cobro).toLocaleString("es-AR")} por unidad a ${subscription.destino_cobro}`;
  }

  return `${Number(subscription.valor_cobro).toLocaleString("es-AR")}% del valor por unidad a ${subscription.destino_cobro}`;
}

function applySubscriptionToForm(
  subscription: SubscriptionRow | null,
  setters: {
    setPlan: (value: SubscriptionRow["plan"]) => void;
    setSubscriptionStatus: (value: SubscriptionRow["estado"]) => void;
    setMonthlyAmount: (value: string) => void;
    setNextDueDate: (value: string) => void;
    setSubscriptionNotes: (value: string) => void;
  },
) {
  if (!subscription) {
    setters.setPlan("base");
    setters.setSubscriptionStatus("trial");
    setters.setMonthlyAmount("0");
    setters.setNextDueDate("");
    setters.setSubscriptionNotes("");
    return;
  }

  setters.setPlan(subscription.plan);
  setters.setSubscriptionStatus(subscription.estado);
  setters.setMonthlyAmount(String(subscription.monto_mensual));
  setters.setNextDueDate(subscription.proximo_vencimiento ?? "");
  setters.setSubscriptionNotes(subscription.observaciones ?? "");
}

export function PlatformBillingPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [plan, setPlan] = useState<SubscriptionRow["plan"]>("base");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionRow["estado"]>("trial");
  const [monthlyAmount, setMonthlyAmount] = useState("0");
  const [nextDueDate, setNextDueDate] = useState("");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentRow["estado"]>("pendiente");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const syncSelectedSubscriptionForm = useCallback((subscription: SubscriptionRow | null) => {
    applySubscriptionToForm(subscription, {
      setPlan,
      setSubscriptionStatus,
      setMonthlyAmount,
      setNextDueDate,
      setSubscriptionNotes,
    });
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

    const [tenantsResult, subscriptionsResult, paymentsResult] = await Promise.all([
      supabase.from("consorcios").select("id, nombre").order("nombre", { ascending: true }),
      supabase.from("consorcio_suscripciones").select("id, consorcio_id, admin_id, plan, estado, monto_mensual, precio_lista_por_unidad, modalidad_cobro, valor_cobro, destino_cobro, proximo_vencimiento, ultimo_pago_at, observaciones").order("created_at", { ascending: false }),
      supabase.from("admin_payment_events").select("id, suscripcion_id, consorcio_id, importe, estado, metodo, referencia, fecha_pago, fecha_vencimiento, nota, created_at").order("created_at", { ascending: false }).limit(10),
    ]);

    const firstError = [tenantsResult.error, subscriptionsResult.error, paymentsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextTenants = (tenantsResult.data as Tenant[] | null) ?? [];
    const nextSubscriptions = (subscriptionsResult.data as SubscriptionRow[] | null) ?? [];
    setTenants(nextTenants);
    setSubscriptions(nextSubscriptions);
    setPayments((paymentsResult.data as PaymentRow[] | null) ?? []);

    const nextSelectedTenantId = selectedTenantId || nextTenants[0]?.id || "";
    setSelectedTenantId(nextSelectedTenantId);
    syncSelectedSubscriptionForm(
      nextSubscriptions.find((item) => item.consorcio_id === nextSelectedTenantId) ?? null,
    );

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

  function handleTenantSelection(nextTenantId: string) {
    setSelectedTenantId(nextTenantId);
    syncSelectedSubscriptionForm(
      subscriptions.find((item) => item.consorcio_id === nextTenantId) ?? null,
    );
  }

  async function handleSubscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedTenantId || !session?.user) {
      return;
    }

    setSavingSubscription(true);
    setError("");
    setMessage("");

    const payload = {
      consorcio_id: selectedTenantId,
      admin_id: null,
      plan,
      estado: subscriptionStatus,
      monto_mensual: Number(monthlyAmount || 0),
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

    setMessage("Suscripcion guardada correctamente.");
    await loadData(session.user.id);
    setSavingSubscription(false);
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedSubscription || !session?.user) {
      setError("Primero debes guardar una suscripcion para este consorcio.");
      return;
    }

    setSavingPayment(true);
    setError("");
    setMessage("");

    const payload = {
      suscripcion_id: selectedSubscription.id,
      consorcio_id: selectedSubscription.consorcio_id,
      registrado_por: session.user.id,
      importe: Number(paymentAmount || 0),
      estado: paymentStatus,
      metodo: paymentMethod || null,
      referencia: paymentReference || null,
      fecha_pago: paymentDate || null,
      fecha_vencimiento: paymentDueDate || null,
      nota: paymentNote || null,
    };

    const { error: insertError } = await supabase.from("admin_payment_events").insert(payload);
    if (insertError) {
      setError(insertError.message);
      setSavingPayment(false);
      return;
    }

    if (paymentStatus === "pagado") {
      await supabase
        .from("consorcio_suscripciones")
        .update({ ultimo_pago_at: paymentDate || new Date().toISOString(), estado: "activa" })
        .eq("id", selectedSubscription.id);
    }

    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentReference("");
    setPaymentDueDate("");
    setPaymentDate("");
    setPaymentNote("");
    setPaymentStatus("pendiente");
    setMessage("Movimiento de pago registrado.");
    await loadData(session.user.id);
    setSavingPayment(false);
  }

  if (!configured || profile?.rol !== "superadmin") {
    return null;
  }

  const visiblePayments = payments.filter((item) => item.consorcio_id === selectedTenantId).slice(0, 6);

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Facturacion base</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Suscripciones y pagos de administradores</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Este bloque te deja gestionar el estado comercial de cada consorcio antes de integrar pasarela de pago externa.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-6">
          <form className="role-card grid gap-4" onSubmit={handleSubscriptionSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Suscripcion</p>
            <label><span className="field-label">Consorcio</span><select className="field-select mt-2" onChange={(event) => handleTenantSelection(event.target.value)} value={selectedTenantId}>{tenants.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label><span className="field-label">Plan</span><select className="field-select mt-2" onChange={(event) => setPlan(event.target.value as SubscriptionRow["plan"])} value={plan}>{planOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Estado comercial</span><select className="field-select mt-2" onChange={(event) => setSubscriptionStatus(event.target.value as SubscriptionRow["estado"])} value={subscriptionStatus}>{subscriptionStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Monto mensual</span><input className="field mt-2" min="0" onChange={(event) => setMonthlyAmount(event.target.value)} required step="0.01" type="number" value={monthlyAmount} /></label>
            <label><span className="field-label">Proximo vencimiento</span><input className="field mt-2" onChange={(event) => setNextDueDate(event.target.value)} type="date" value={nextDueDate} /></label>
            <label><span className="field-label">Observaciones</span><textarea className="field-textarea mt-2" onChange={(event) => setSubscriptionNotes(event.target.value)} value={subscriptionNotes} /></label>
            <button className="button-primary" disabled={savingSubscription || loading} type="submit">{savingSubscription ? "Guardando..." : "Guardar suscripcion"}</button>
          </form>

          <form className="role-card grid gap-4" onSubmit={handlePaymentSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Registrar pago</p>
            <label><span className="field-label">Importe</span><input className="field mt-2" min="0" onChange={(event) => setPaymentAmount(event.target.value)} required step="0.01" type="number" value={paymentAmount} /></label>
            <label><span className="field-label">Estado</span><select className="field-select mt-2" onChange={(event) => setPaymentStatus(event.target.value as PaymentRow["estado"])} value={paymentStatus}>{paymentStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Metodo</span><input className="field mt-2" onChange={(event) => setPaymentMethod(event.target.value)} placeholder="Transferencia, efectivo, MP" value={paymentMethod} /></label>
            <label><span className="field-label">Referencia</span><input className="field mt-2" onChange={(event) => setPaymentReference(event.target.value)} placeholder="Nro. operacion o recibo" value={paymentReference} /></label>
            <label><span className="field-label">Fecha de vencimiento</span><input className="field mt-2" onChange={(event) => setPaymentDueDate(event.target.value)} type="date" value={paymentDueDate} /></label>
            <label><span className="field-label">Fecha de pago</span><input className="field mt-2" onChange={(event) => setPaymentDate(event.target.value)} type="date" value={paymentDate} /></label>
            <label><span className="field-label">Nota</span><textarea className="field-textarea mt-2" onChange={(event) => setPaymentNote(event.target.value)} value={paymentNote} /></label>
            <button className="button-primary" disabled={savingPayment || loading} type="submit">{savingPayment ? "Registrando..." : "Registrar movimiento"}</button>
          </form>
        </div>

        <div className="grid gap-6">
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado por consorcio</p>
            <div className="mt-4 grid gap-3">
              {loading ? <p className="text-sm leading-7 text-slate-600">Cargando suscripciones.</p> : subscriptions.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay suscripciones registradas.</p> : subscriptions.map((item) => <button className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-colors hover:border-slate-300" key={item.id} onClick={() => handleTenantSelection(item.consorcio_id)} type="button"><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{tenants.find((tenant) => tenant.id === item.consorcio_id)?.nombre ?? item.consorcio_id}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">Plan {item.plan} · $ {Number(item.monto_mensual).toLocaleString("es-AR")}/mes</p><p className="mt-1 text-sm leading-7 text-slate-600">$ {Number(item.precio_lista_por_unidad).toLocaleString("es-AR")} por unidad · {describeChargeMode(item)}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Vence {item.proximo_vencimiento ? new Date(item.proximo_vencimiento).toLocaleDateString("es-AR") : "sin fecha"}</p></button>)}
            </div>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Movimientos recientes</p>
            <div className="mt-4 grid gap-3">
              {visiblePayments.length === 0 ? <p className="text-sm leading-7 text-slate-600">Aun no hay pagos cargados para este consorcio.</p> : visiblePayments.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">$ {Number(item.importe).toLocaleString("es-AR")}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.metodo ?? "Sin metodo"} · {item.referencia ?? "Sin referencia"}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Vence {item.fecha_vencimiento ? new Date(item.fecha_vencimiento).toLocaleDateString("es-AR") : "-"} · Pago {item.fecha_pago ? new Date(item.fecha_pago).toLocaleDateString("es-AR") : "-"}</p></div>)}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}