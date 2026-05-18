"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type ExpenseRow = {
  id: string;
  monto: number;
  fecha_gasto: string;
  comprobante_url: string;
  categorias_gastos: { nombre: string } | null;
};

type LiquidationRow = {
  id: string;
  titulo: string;
  archivo_url: string;
  periodo_referencia: string | null;
  enlace_pago: string | null;
  publicado_at: string;
};

type PlatformChargeRow = {
  id: string;
  periodo_referencia: string;
  monto: number;
  estado: "pagado" | "pendiente" | "vencido" | "fallido";
  fecha_vencimiento: string | null;
  enlace_pago: string | null;
  detalle: string | null;
  referencia_pago: string | null;
  comprobante_url: string | null;
};

type CategorySummary = {
  name: string;
  total: number;
  share: number;
};

function isExternalUrl(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function getMonthBounds(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

export function ResidentExpensesPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [summaries, setSummaries] = useState<CategorySummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [latestLiquidation, setLatestLiquidation] = useState<LiquidationRow | null>(null);
  const [latestPlatformCharge, setLatestPlatformCharge] = useState<PlatformChargeRow | null>(null);

  const loadExpenses = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { start, end } = getMonthBounds();
    const [expensesResult, liquidationResult, platformChargeResult] = await Promise.all([
      supabase
        .from("gastos")
        .select("id, monto, fecha_gasto, comprobante_url, categorias_gastos(nombre)")
        .gte("fecha_gasto", start)
        .lte("fecha_gasto", end)
        .order("fecha_gasto", { ascending: false })
        .limit(8),
      supabase
        .from("documentos_consorcio")
        .select("id, titulo, archivo_url, periodo_referencia, enlace_pago, publicado_at")
        .eq("tipo", "liquidacion")
        .eq("visible_para_residentes", true)
        .order("publicado_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
        supabase
        .from("cargos_plataforma_unidad")
          .select("id, periodo_referencia, monto, estado, fecha_vencimiento, enlace_pago, detalle, referencia_pago, comprobante_url")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

      const firstError = expensesResult.error ?? liquidationResult.error ?? platformChargeResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextExpenses = (expensesResult.data as ExpenseRow[] | null) ?? [];
    const nextTotal = nextExpenses.reduce((accumulator, item) => accumulator + Number(item.monto), 0);
    const grouped = nextExpenses.reduce<Record<string, number>>((accumulator, item) => {
      const key = item.categorias_gastos?.nombre ?? "Sin categoria";
      accumulator[key] = (accumulator[key] ?? 0) + Number(item.monto);
      return accumulator;
    }, {});

    const nextSummaries = Object.entries(grouped)
      .map(([name, subtotal]) => ({
        name,
        total: subtotal,
        share: nextTotal > 0 ? Math.round((subtotal / nextTotal) * 100) : 0,
      }))
      .sort((left, right) => right.total - left.total);

    setExpenses(nextExpenses);
    setTotal(nextTotal);
    setSummaries(nextSummaries);
    setLatestLiquidation((liquidationResult.data as LiquidationRow | null) ?? null);
    setLatestPlatformCharge((platformChargeResult.data as PlatformChargeRow | null) ?? null);
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
        await loadExpenses();
      } else {
        setLoading(false);
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [loadExpenses, supabase]);

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Expensas y transparencia</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">En que se fue tu plata este mes</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Resumen real de gastos del consorcio, liquidación publicada y acceso directo a comprobantes y pago.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}

      {loading ? <div className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando expensas y liquidaciones.</p></div> : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Resumen mensual</p>
            <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950">$ {total.toLocaleString("es-AR")}</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">Total de gastos cargados en el mes calendario actual.</p>

            <div className="mt-6 grid gap-4">
              {summaries.length === 0 ? <p className="text-sm leading-7 text-slate-600">Aun no hay gastos cargados para este periodo.</p> : summaries.map((item) => <div key={item.name}><div className="flex items-center justify-between gap-3 text-sm text-slate-700"><span>{item.name}</span><span>{item.share}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-900" style={{ width: `${item.share}%` }} /></div><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">$ {item.total.toLocaleString("es-AR")}</p></div>)}
            </div>
          </article>

          <div className="grid gap-6">
            <article className="role-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Liquidacion vigente</p>
                  <h4 className="mt-3 text-2xl font-semibold text-slate-950">{latestLiquidation?.titulo ?? "Sin liquidacion publicada"}</h4>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{latestLiquidation?.periodo_referencia ? `Periodo ${latestLiquidation.periodo_referencia}` : "Cuando administracion publique la liquidacion aparecera aca con su acceso de pago."}</p>
                </div>
                {latestLiquidation ? <span className="status-badge status-badge--success">publicada</span> : <span className="status-badge status-badge--neutral">pendiente</span>}
              </div>

              {latestLiquidation ? <div className="mt-4 flex flex-wrap gap-3"><a className="button-secondary" href={latestLiquidation.archivo_url} rel="noreferrer" target="_blank">Abrir PDF</a>{isExternalUrl(latestLiquidation.enlace_pago) ? <a className="button-primary" href={latestLiquidation.enlace_pago ?? "#"} rel="noreferrer" target="_blank">Ir a pagar</a> : null}</div> : null}
              {latestLiquidation?.enlace_pago && !isExternalUrl(latestLiquidation.enlace_pago) ? <p className="mt-3 text-sm leading-7 text-slate-600">Pago informado por administracion: {latestLiquidation.enlace_pago}</p> : null}
            </article>

            <article className="role-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Cargo de plataforma</p>
                  <h4 className="mt-3 text-2xl font-semibold text-slate-950">{latestPlatformCharge ? `$ ${Number(latestPlatformCharge.monto).toLocaleString("es-AR")}` : "Sin cargo emitido"}</h4>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{latestPlatformCharge ? `Periodo ${latestPlatformCharge.periodo_referencia}. ${latestPlatformCharge.detalle ?? "Cargo generado por administracion."}` : "Cuando administracion traslade el costo del servicio a tu unidad, aparecera aca con su estado."}</p>
                </div>
                <span className="status-badge status-badge--neutral">{latestPlatformCharge?.estado ?? "sin emitir"}</span>
              </div>
              {latestPlatformCharge ? <p className="mt-3 text-sm leading-7 text-slate-600">Vence {latestPlatformCharge.fecha_vencimiento ? new Date(latestPlatformCharge.fecha_vencimiento).toLocaleDateString("es-AR") : "sin fecha"}{latestPlatformCharge.referencia_pago ? ` · Ref. ${latestPlatformCharge.referencia_pago}` : ""}</p> : null}
              {latestPlatformCharge?.enlace_pago ? isExternalUrl(latestPlatformCharge.enlace_pago) ? <div className="mt-4"><a className="button-primary" href={latestPlatformCharge.enlace_pago} rel="noreferrer" target="_blank">Ir a pagar cargo de plataforma</a></div> : <p className="mt-3 text-sm leading-7 text-slate-600">Instruccion de pago: {latestPlatformCharge.enlace_pago}</p> : null}
              {latestPlatformCharge?.comprobante_url ? <div className="mt-4"><a className="button-secondary" href={latestPlatformCharge.comprobante_url} rel="noreferrer" target="_blank">Ver comprobante de pago</a></div> : null}
            </article>

            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Comprobantes recientes</p>
              <div className="mt-4 grid gap-3">
                {expenses.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay comprobantes cargados este mes.</p> : expenses.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.categorias_gastos?.nombre ?? "Sin categoria"}</h4><p className="mt-1 text-sm leading-7 text-slate-600">$ {Number(item.monto).toLocaleString("es-AR")}</p></div><a className="button-secondary" href={item.comprobante_url} rel="noreferrer" target="_blank">Ver</a></div><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.fecha_gasto).toLocaleDateString("es-AR")}</p></div>)}
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}