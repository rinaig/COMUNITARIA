"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { EXPENSE_BUCKET, getCurrentConsorcioId, uploadTenantFile } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Category = { id: string; nombre: string };
type Expense = { id: string; descripcion: string; monto: number; fecha_gasto: string; comprobante_url: string; categorias_gastos?: { nombre: string } | null };

export function AdminFinancePanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const loadFinance = useCallback(async () => {
    if (!supabase) {
      return;
    }
    setLoading(true);
    setError("");
    const [categoriesResult, expensesResult] = await Promise.all([
      supabase.from("categorias_gastos").select("id, nombre").order("nombre", { ascending: true }),
      supabase.from("gastos").select("id, descripcion, monto, fecha_gasto, comprobante_url, categorias_gastos(nombre)").order("fecha_gasto", { ascending: false }).limit(6),
    ]);
    const firstError = [categoriesResult.error, expensesResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    const nextCategories = (categoriesResult.data as Category[] | null) ?? [];
    setCategories(nextCategories);
    if (!categoryId && nextCategories[0]) {
      setCategoryId(nextCategories[0].id);
    }
    setExpenses((expensesResult.data as Expense[] | null) ?? []);
    setLoading(false);
  }, [categoryId, supabase]);

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
        await loadFinance();
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadFinance, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");

    if (!session?.user) {
      setError("No hay sesion activa para subir archivos.");
      setSaving(false);
      return;
    }

    if (!receiptFile) {
      setError("Debes adjuntar un comprobante.");
      setSaving(false);
      return;
    }

    let publicUrl = "";

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const upload = await uploadTenantFile(
        supabase,
        EXPENSE_BUCKET,
        consorcioId,
        receiptFile,
        "expenses",
      );
      publicUrl = upload.publicUrl;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el comprobante.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("gastos").insert({
      categoria_id: categoryId,
      descripcion: description,
      monto: Number(amount),
      fecha_gasto: expenseDate,
      comprobante_url: publicUrl,
    });
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    setDescription("");
    setAmount("");
    setReceiptFile(null);
    setMessage("Gasto cargado correctamente.");
    await loadFinance();
    setSaving(false);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Modulo financiero</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Carga y listado real de gastos</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Permite cargar gastos con comprobante y ver los ultimos movimientos del consorcio en tiempo real.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form className="role-card grid gap-4" onSubmit={handleSubmit}>
          <label><span className="field-label">Categoria</span><select className="field-select mt-2" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>{categories.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label><span className="field-label">Descripcion</span><input className="field mt-2" onChange={(event) => setDescription(event.target.value)} required value={description} /></label>
          <label><span className="field-label">Monto</span><input className="field mt-2" min="0" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} /></label>
          <label><span className="field-label">Fecha del gasto</span><input className="field mt-2" onChange={(event) => setExpenseDate(event.target.value)} required type="date" value={expenseDate} /></label>
          <label><span className="field-label">Comprobante</span><input className="field mt-2" accept=".pdf,image/*" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} required type="file" /></label>
          <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Guardando..." : "Cargar gasto"}</button>
        </form>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Ultimos gastos</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando gastos recientes.</p> : expenses.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay gastos registrados todavia.</p> : expenses.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.descripcion}</h4><span className="status-badge status-badge--neutral">{item.categorias_gastos?.nombre ?? "Categoria"}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">$ {Number(item.monto).toLocaleString("es-AR")}</p><div className="mt-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{new Date(item.fecha_gasto).toLocaleDateString("es-AR")}</span><a href={item.comprobante_url} rel="noreferrer" target="_blank">Ver comprobante</a></div></div>)}
          </div>
        </article>
      </div>
    </section>
  );
}