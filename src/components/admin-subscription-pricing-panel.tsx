"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { DOCUMENT_BUCKET, getCurrentConsorcioId, uploadTenantFile } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type ChargeMode = "admin_absorbe" | "monto_fijo_por_unidad" | "porcentaje_por_unidad";
type ChargeTarget = "propietario" | "inquilino" | "todos";

type SubscriptionPricingRow = {
  id: string;
  consorcio_id: string;
  monto_mensual: number;
  precio_lista_por_unidad: number;
  unit_price_override: number | null;
  modalidad_cobro: ChargeMode;
  valor_cobro: number;
  destino_cobro: ChargeTarget;
  observaciones: string | null;
};

type UnitChargeRow = {
  id: string;
  periodo_referencia: string;
  destino_cobro: ChargeTarget;
  monto: number;
  estado: "pagado" | "pendiente" | "vencido" | "fallido";
  fecha_vencimiento: string | null;
  enlace_pago: string | null;
  referencia_pago: string | null;
  comprobante_url: string | null;
  detalle: string | null;
  unidades_funcionales: { codigo: string } | { codigo: string }[] | null;
};

type PaymentEventRow = {
  id: string;
  importe: number;
  estado: "pagado" | "pendiente" | "vencido" | "fallido";
  fecha_pago: string | null;
  referencia: string | null;
  nota: string | null;
  created_at: string;
};

type ConsorcioSummary = {
  id: string;
  nombre: string;
  cantidad_unidades: number;
};

const chargeModeLabels: Record<ChargeMode, string> = {
  admin_absorbe: "Lo absorbe la administracion",
  monto_fijo_por_unidad: "Monto fijo por unidad",
  porcentaje_por_unidad: "Porcentaje sobre el valor por unidad",
};

const chargeTargetLabels: Record<ChargeTarget, string> = {
  propietario: "Propietarios",
  inquilino: "Inquilinos",
  todos: "Todos los ocupantes",
};

function calculateResidentUnitCharge(subscription: SubscriptionPricingRow | null) {
  if (!subscription) {
    return 0;
  }

  if (subscription.modalidad_cobro === "admin_absorbe") {
    return 0;
  }

  if (subscription.modalidad_cobro === "monto_fijo_por_unidad") {
    return Number(subscription.valor_cobro);
  }

  return Number(subscription.precio_lista_por_unidad) * (Number(subscription.valor_cobro) / 100);
}

function getDefaultPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeUnitRelation(relation: UnitChargeRow["unidades_funcionales"]) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function isExternalUrl(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function AdminSubscriptionPricingPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [consorcio, setConsorcio] = useState<ConsorcioSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionPricingRow | null>(null);
  const [platformDefaultUnitPrice, setPlatformDefaultUnitPrice] = useState("0");
  const [unitPrice, setUnitPrice] = useState("0");
  const [chargeMode, setChargeMode] = useState<ChargeMode>("admin_absorbe");
  const [chargeValue, setChargeValue] = useState("0");
  const [chargeTarget, setChargeTarget] = useState<ChargeTarget>("propietario");
  const [notes, setNotes] = useState("");
  const [transferEvents, setTransferEvents] = useState<PaymentEventRow[]>([]);
  const [transferAmount, setTransferAmount] = useState("0");
  const [transferDate, setTransferDate] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [charges, setCharges] = useState<UnitChargeRow[]>([]);
  const [generationPeriod, setGenerationPeriod] = useState(() => getDefaultPeriod());
  const [generationDueDate, setGenerationDueDate] = useState("");
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [chargeLinks, setChargeLinks] = useState<Record<string, string>>({});
  const [chargeDetails, setChargeDetails] = useState<Record<string, string>>({});
  const [chargeDueDates, setChargeDueDates] = useState<Record<string, string>>({});
  const [paymentReceipts, setPaymentReceipts] = useState<Record<string, File | null>>({});
  const [generatingCharges, setGeneratingCharges] = useState(false);
  const [markingChargeId, setMarkingChargeId] = useState<string | null>(null);
  const [savingChargeId, setSavingChargeId] = useState<string | null>(null);
  const [reportingTransfer, setReportingTransfer] = useState(false);

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const consorcioId = await getCurrentConsorcioId(supabase, userId);
    const [consorcioResult, settingsResult, subscriptionResult, transferEventsResult, chargesResult] = await Promise.all([
      supabase.from("consorcios").select("id, nombre, cantidad_unidades").eq("id", consorcioId).maybeSingle(),
      supabase.from("platform_settings").select("default_unit_price").eq("id", true).maybeSingle(),
      supabase.from("consorcio_suscripciones").select("id, consorcio_id, monto_mensual, precio_lista_por_unidad, unit_price_override, modalidad_cobro, valor_cobro, destino_cobro, observaciones").eq("consorcio_id", consorcioId).maybeSingle(),
      supabase.from("admin_payment_events").select("id, importe, estado, fecha_pago, referencia, nota, created_at").eq("consorcio_id", consorcioId).order("created_at", { ascending: false }).limit(6),
      supabase.from("cargos_plataforma_unidad").select("id, periodo_referencia, destino_cobro, monto, estado, fecha_vencimiento, enlace_pago, referencia_pago, comprobante_url, detalle, unidades_funcionales(codigo)").order("created_at", { ascending: false }).limit(8),
    ]);

    const firstError = consorcioResult.error ?? settingsResult.error ?? subscriptionResult.error ?? transferEventsResult.error ?? chargesResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextConsorcio = (consorcioResult.data as ConsorcioSummary | null) ?? null;
    const nextSubscription = (subscriptionResult.data as SubscriptionPricingRow | null) ?? null;
    const defaultUnitPrice = Number((settingsResult.data as { default_unit_price: number } | null)?.default_unit_price ?? 0);

    setConsorcio(nextConsorcio);
    setSubscription(nextSubscription);
    setPlatformDefaultUnitPrice(String(defaultUnitPrice));
    setUnitPrice(String(nextSubscription?.unit_price_override ?? nextSubscription?.precio_lista_por_unidad ?? defaultUnitPrice));
    setChargeMode(nextSubscription?.modalidad_cobro ?? "admin_absorbe");
    setChargeValue(String(nextSubscription?.valor_cobro ?? 0));
    setChargeTarget(nextSubscription?.destino_cobro ?? "propietario");
    setNotes(nextSubscription?.observaciones ?? "");
    setTransferEvents((transferEventsResult.data as PaymentEventRow[] | null) ?? []);
    const nextCharges = (chargesResult.data as UnitChargeRow[] | null) ?? [];
    setCharges(nextCharges);
    setChargeLinks(Object.fromEntries(nextCharges.map((item) => [item.id, item.enlace_pago ?? ""])));
    setChargeDetails(Object.fromEntries(nextCharges.map((item) => [item.id, item.detalle ?? ""])));
    setChargeDueDates(Object.fromEntries(nextCharges.map((item) => [item.id, item.fecha_vencimiento ?? ""])));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const { error: saveError } = await supabase.rpc("upsert_subscription_charge_config", {
      p_precio_lista_por_unidad: Number(unitPrice || 0),
      p_modalidad: chargeMode,
      p_valor_cobro: Number(chargeValue || 0),
      p_destino_cobro: chargeTarget,
      p_observaciones: notes || null,
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setMessage("Esquema comercial guardado correctamente.");
    await loadData(session.user.id);
    setSaving(false);
  }

  async function handleGenerateCharges() {
    if (!supabase || !session?.user) {
      return;
    }

    setGeneratingCharges(true);
    setError("");
    setMessage("");

    const { data, error: generationError } = await supabase.rpc("generate_platform_unit_charges", {
      p_periodo_referencia: generationPeriod,
      p_fecha_vencimiento: generationDueDate || null,
    });

    if (generationError) {
      setError(generationError.message);
      setGeneratingCharges(false);
      return;
    }

    setMessage(`Se generaron o actualizaron ${Number(data ?? 0)} cargos por unidad.`);
    await loadData(session.user.id);
    setGeneratingCharges(false);
  }

  async function handleReportTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user || !subscription) {
      return;
    }

    setReportingTransfer(true);
    setError("");
    setMessage("");

    const { error: reportError } = await supabase.from("admin_payment_events").insert({
      consorcio_id: subscription.consorcio_id,
      suscripcion_id: subscription.id,
      importe: Number(transferAmount || 0),
      estado: "pendiente",
      metodo: "transferencia_admin",
      referencia: transferReference || null,
      fecha_pago: transferDate || null,
      nota: transferNote || null,
    });

    if (reportError) {
      setError(reportError.message);
      setReportingTransfer(false);
      return;
    }

    setTransferAmount(String(subscription.monto_mensual || 0));
    setTransferDate("");
    setTransferReference("");
    setTransferNote("");
    setMessage("Transferencia reportada al SuperUser.");
    await loadData(session.user.id);
    setReportingTransfer(false);
  }

  async function handleSaveChargeCollection(chargeId: string) {
    if (!supabase || !session?.user) {
      return;
    }

    setSavingChargeId(chargeId);
    setError("");
    setMessage("");

    const { error: saveError } = await supabase.rpc("update_platform_unit_charge_collection", {
      p_charge_id: chargeId,
      p_fecha_vencimiento: chargeDueDates[chargeId] || null,
      p_enlace_pago: chargeLinks[chargeId] || null,
      p_detalle: chargeDetails[chargeId] || null,
    });

    if (saveError) {
      setError(saveError.message);
      setSavingChargeId(null);
      return;
    }

    setMessage("Datos de cobranza actualizados.");
    await loadData(session.user.id);
    setSavingChargeId(null);
  }

  async function handleMarkAsPaid(chargeId: string) {
    if (!supabase || !session?.user) {
      return;
    }

    setMarkingChargeId(chargeId);
    setError("");
    setMessage("");

    let receiptUrl: string | null = null;

    try {
      const receiptFile = paymentReceipts[chargeId] ?? null;
      if (receiptFile) {
        const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
        const upload = await uploadTenantFile(
          supabase,
          DOCUMENT_BUCKET,
          consorcioId,
          receiptFile,
          "platform-charges",
        );
        receiptUrl = upload.publicUrl;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el comprobante.");
      setMarkingChargeId(null);
      return;
    }

    const { error: markError } = await supabase.rpc("mark_platform_unit_charge_paid", {
      p_charge_id: chargeId,
      p_referencia_pago: paymentReferences[chargeId] || null,
      p_comprobante_url: receiptUrl,
    });

    if (markError) {
      setError(markError.message);
      setMarkingChargeId(null);
      return;
    }

    setMessage("Cargo marcado como pagado.");
    await loadData(session.user.id);
    setMarkingChargeId(null);
  }

  if (!configured || !session?.user) {
    return null;
  }

  const effectiveSubscription: SubscriptionPricingRow | null = subscription
    ? {
        ...subscription,
        precio_lista_por_unidad: Number(unitPrice || subscription.precio_lista_por_unidad || 0),
        unit_price_override: subscription.unit_price_override,
        modalidad_cobro: chargeMode,
        valor_cobro: Number(chargeValue || subscription.valor_cobro || 0),
        destino_cobro: chargeTarget,
        observaciones: notes || null,
      }
    : {
        id: "preview",
        consorcio_id: consorcio?.id ?? "",
        monto_mensual: Number(unitPrice || 0) * Number(consorcio?.cantidad_unidades ?? 0),
        precio_lista_por_unidad: Number(unitPrice || 0),
        unit_price_override: null,
        modalidad_cobro: chargeMode,
        valor_cobro: Number(chargeValue || 0),
        destino_cobro: chargeTarget,
        observaciones: notes || null,
      };

  const residentUnitCharge = calculateResidentUnitCharge(effectiveSubscription);
  const totalUnits = Number(consorcio?.cantidad_unidades ?? 0);
  const totalMonthly = Number(unitPrice || 0) * totalUnits;
  const adminResidual = Math.max(Number(unitPrice || 0) - residentUnitCharge, 0);

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Modelo comercial</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Como se reparte el costo de la plataforma</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">El precio base lo define la plataforma. Desde aca solo definis como trasladarlo y reportas tus transferencias.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <form className="role-card grid gap-4" onSubmit={handleSubmit}>
          <label><span className="field-label">Consorcio</span><input className="field mt-2" disabled value={consorcio?.nombre ?? "Cargando"} /></label>
          <label><span className="field-label">Unidades funcionales</span><input className="field mt-2" disabled value={String(totalUnits)} /></label>
          <label><span className="field-label">Precio de lista por unidad</span><input className="field mt-2" disabled type="text" value={`$ ${Number(unitPrice || 0).toLocaleString("es-AR")}`} /></label>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">General plataforma: $ {Number(platformDefaultUnitPrice || 0).toLocaleString("es-AR")}{subscription?.unit_price_override != null ? ` · Especial activo: $ ${Number(subscription.unit_price_override).toLocaleString("es-AR")}` : ""}</p>
          <label><span className="field-label">Modalidad de cobro</span><select className="field-select mt-2" onChange={(event) => setChargeMode(event.target.value as ChargeMode)} value={chargeMode}><option value="admin_absorbe">Lo absorbe la administracion</option><option value="monto_fijo_por_unidad">Monto fijo por unidad</option><option value="porcentaje_por_unidad">Porcentaje sobre precio unitario</option></select></label>
          {chargeMode !== "admin_absorbe" ? <label><span className="field-label">{chargeMode === "porcentaje_por_unidad" ? "Porcentaje a cobrar" : "Monto a cobrar por unidad"}</span><input className="field mt-2" min="0" max={chargeMode === "porcentaje_por_unidad" ? "100" : undefined} onChange={(event) => setChargeValue(event.target.value)} required step="0.01" type="number" value={chargeValue} /></label> : null}
          <label><span className="field-label">Destino del cobro</span><select className="field-select mt-2" onChange={(event) => setChargeTarget(event.target.value as ChargeTarget)} value={chargeTarget}><option value="propietario">Propietarios</option><option value="inquilino">Inquilinos</option><option value="todos">Todos los ocupantes</option></select></label>
          <label><span className="field-label">Observaciones</span><textarea className="field-textarea mt-2" onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} /></label>
          <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Guardando..." : "Guardar esquema comercial"}</button>
        </form>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Resumen del reparto</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Facturacion total estimada</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">$ {totalMonthly.toLocaleString("es-AR")}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">$ {Number(unitPrice || 0).toLocaleString("es-AR")} por unidad sobre {totalUnits} unidades.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Cobro por unidad</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">$ {residentUnitCharge.toLocaleString("es-AR")}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">{chargeModeLabels[chargeMode]} · destino {chargeTargetLabels[chargeTarget].toLowerCase()}.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Saldo absorbido por admin</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">$ {adminResidual.toLocaleString("es-AR")}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">Resto por unidad que no se traslada al usuario.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Esquema vigente</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">{chargeModeLabels[effectiveSubscription.modalidad_cobro]}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">Cobro dirigido a {chargeTargetLabels[effectiveSubscription.destino_cobro].toLowerCase()}.</p>
            </div>
          </div>
        </article>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <form className="role-card grid gap-4" onSubmit={handleReportTransfer}>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Reportar transferencia a plataforma</p>
          <label><span className="field-label">Monto transferido</span><input className="field mt-2" min="0" onChange={(event) => setTransferAmount(event.target.value)} required step="0.01" type="number" value={transferAmount || String(subscription?.monto_mensual ?? 0)} /></label>
          <label><span className="field-label">Fecha de transferencia</span><input className="field mt-2" onChange={(event) => setTransferDate(event.target.value)} type="date" value={transferDate} /></label>
          <label><span className="field-label">Referencia</span><input className="field mt-2" onChange={(event) => setTransferReference(event.target.value)} placeholder="Alias, CBU o numero de operacion" value={transferReference} /></label>
          <label><span className="field-label">Detalle</span><textarea className="field-textarea mt-2" onChange={(event) => setTransferNote(event.target.value)} rows={4} value={transferNote} /></label>
          <button className="button-primary" disabled={reportingTransfer || !subscription} type="submit">{reportingTransfer ? "Reportando..." : "Reportar transferencia"}</button>
        </form>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Transferencias enviadas</p>
          <div className="mt-4 grid gap-3">
            {transferEvents.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no reportaste transferencias.</p> : transferEvents.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">$ {Number(item.importe).toLocaleString("es-AR")}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{item.fecha_pago ? new Date(item.fecha_pago).toLocaleDateString("es-AR") : new Date(item.created_at).toLocaleDateString("es-AR")}</p></div><span className={item.estado === "pagado" ? "status-badge status-badge--success" : item.estado === "fallido" ? "rounded-full bg-rose-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-rose-700" : "status-badge status-badge--warning"}>{item.estado}</span></div>{item.referencia ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{item.referencia}</p> : null}{item.nota ? <p className="mt-2 text-sm leading-7 text-slate-600">{item.nota}</p> : null}</div>)}
          </div>
        </article>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <article className="role-card grid gap-4">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Generacion de cargos</p>
          <label><span className="field-label">Periodo de referencia</span><input className="field mt-2" onChange={(event) => setGenerationPeriod(event.target.value)} placeholder="2026-05" value={generationPeriod} /></label>
          <label><span className="field-label">Fecha de vencimiento</span><input className="field mt-2" onChange={(event) => setGenerationDueDate(event.target.value)} type="date" value={generationDueDate} /></label>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-600">
            {chargeMode === "admin_absorbe"
              ? "Con el esquema actual no se trasladan cargos a unidades."
              : `Se generara un cargo de $ ${residentUnitCharge.toLocaleString("es-AR")} por unidad para ${chargeTargetLabels[chargeTarget].toLowerCase()}.`}
          </div>
          <button className="button-primary" disabled={generatingCharges || loading || chargeMode === "admin_absorbe"} onClick={() => void handleGenerateCharges()} type="button">{generatingCharges ? "Generando..." : "Generar cargos del periodo"}</button>
        </article>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Cargos recientes por unidad</p>
          <div className="mt-4 grid gap-3">
            {charges.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay cargos generados.</p> : charges.map((item) => {
              const unit = normalizeUnitRelation(item.unidades_funcionales);
              const isPaid = item.estado === "pagado";
              return <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">Unidad {unit?.codigo ?? "sin codigo"}</h4><p className="mt-1 text-sm leading-7 text-slate-600">Periodo {item.periodo_referencia} · $ {Number(item.monto).toLocaleString("es-AR")}</p></div><span className="status-badge status-badge--neutral">{item.estado}</span></div><div className="mt-3 grid gap-3 md:grid-cols-2"><label><span className="field-label">Vencimiento</span><input className="field mt-2" onChange={(event) => setChargeDueDates((current) => ({ ...current, [item.id]: event.target.value }))} type="date" value={chargeDueDates[item.id] ?? ""} /></label><label><span className="field-label">Enlace o instruccion</span><input className="field mt-2" onChange={(event) => setChargeLinks((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="https://..., alias o CBU" value={chargeLinks[item.id] ?? ""} /></label></div><label className="mt-3 block"><span className="field-label">Detalle</span><textarea className="field-textarea mt-2" onChange={(event) => setChargeDetails((current) => ({ ...current, [item.id]: event.target.value }))} rows={3} value={chargeDetails[item.id] ?? ""} /></label><div className="mt-3 flex flex-wrap gap-3">{chargeLinks[item.id] ? isExternalUrl(chargeLinks[item.id]) ? <a className="button-secondary" href={chargeLinks[item.id]} rel="noreferrer" target="_blank">Abrir enlace</a> : <span className="rounded-full bg-slate-100 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-500">Instruccion manual cargada</span> : null}<button className="button-secondary" disabled={savingChargeId === item.id} onClick={() => void handleSaveChargeCollection(item.id)} type="button">{savingChargeId === item.id ? "Guardando..." : "Guardar cobranza"}</button></div>{isPaid ? <div className="mt-3 text-sm leading-7 text-emerald-700">Pago registrado {item.referencia_pago ? `· Ref. ${item.referencia_pago}` : ""}{item.comprobante_url ? <div className="mt-2"><a className="button-secondary" href={item.comprobante_url} rel="noreferrer" target="_blank">Ver comprobante</a></div> : null}</div> : <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input className="field" onChange={(event) => setPaymentReferences((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Referencia de pago" value={paymentReferences[item.id] ?? ""} /><input accept=".pdf,image/*" className="field" onChange={(event) => setPaymentReceipts((current) => ({ ...current, [item.id]: event.target.files?.[0] ?? null }))} type="file" /><button className="button-secondary" disabled={markingChargeId === item.id} onClick={() => void handleMarkAsPaid(item.id)} type="button">{markingChargeId === item.id ? "Imputando..." : "Marcar como pagado"}</button></div>}</div>;
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
