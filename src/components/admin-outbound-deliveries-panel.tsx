"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Channel = "email" | "whatsapp";
type DeliveryStatus = "pendiente" | "enviado" | "fallido" | "omitido";

type DeliveryRow = {
  id: string;
  canal: Channel;
  destinatario_email: string | null;
  destinatario_ref: string | null;
  asunto: string;
  cuerpo: string;
  estado: DeliveryStatus;
  proveedor: string | null;
  error_message: string | null;
  created_at: string;
};

const channelLabels: Record<Channel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
};

export function AdminOutboundDeliveriesPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [sendingTest, setSendingTest] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [testChannel, setTestChannel] = useState<Channel>("email");
  const [testDestination, setTestDestination] = useState("");
  const [testSubject, setTestSubject] = useState("Prueba de canal Comunitaria");
  const [testBody, setTestBody] = useState("Mensaje de prueba generado desde el modulo administrador.");

  const loadRows = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("notificacion_salidas")
      .select("id, canal, destinatario_email, destinatario_ref, asunto, cuerpo, estado, proveedor, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(12);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setRows((data as DeliveryRow[] | null) ?? []);
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
        await loadRows();
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadRows, supabase]);

  async function handleTestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSendingTest(true);
    setError("");
    setMessage("");

    const { error: testError } = await supabase.rpc("enqueue_test_channel_delivery", {
      p_canal: testChannel,
      p_destino: testDestination,
      p_asunto: testSubject,
      p_cuerpo: testBody,
    });

    if (testError) {
      setError(testError.message);
      setSendingTest(false);
      return;
    }

    setMessage(`Prueba de ${channelLabels[testChannel].toLowerCase()} enviada a la cola.`);
    await loadRows();
    setSendingTest(false);
  }

  async function handleProcessQueue() {
    if (!session?.access_token) {
      setError("No se encontro una sesion valida para procesar la cola.");
      return;
    }

    setProcessingQueue(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/outbound/process", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 12 }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      total?: number;
      enviados?: number;
      fallidos?: number;
      omitidos?: number;
    };

    if (!response.ok) {
      setError(payload.error ?? "No se pudo procesar la cola saliente.");
      setProcessingQueue(false);
      return;
    }

    setMessage(`Procesadas ${payload.total ?? 0} salidas: ${payload.enviados ?? 0} enviadas, ${payload.fallidos ?? 0} fallidas, ${payload.omitidos ?? 0} omitidas.`);
    await loadRows();
    setProcessingQueue(false);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Bandeja saliente</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Cola operativa de email y WhatsApp</h3>
        </div>
        <div className="flex max-w-xl flex-col items-start gap-3 text-sm leading-7 text-slate-600">
          <p>Administracion puede verificar que canal se esta usando, detectar omisiones por falta de configuracion, encolar pruebas simples y disparar el procesador real desde el portal.</p>
          <button className="button-secondary" disabled={processingQueue || loading} onClick={() => void handleProcessQueue()} type="button">{processingQueue ? "Procesando cola..." : "Procesar pendientes ahora"}</button>
        </div>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form className="role-card grid gap-4" onSubmit={handleTestSubmit}>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Enviar prueba</p>
          <label><span className="field-label">Canal</span><select className="field-select mt-2" onChange={(event) => setTestChannel(event.target.value as Channel)} value={testChannel}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
          <label><span className="field-label">Destino</span><input className="field mt-2" onChange={(event) => setTestDestination(event.target.value)} placeholder={testChannel === "email" ? "destino@correo.com" : "+54911..."} required value={testDestination} /></label>
          <label><span className="field-label">Asunto</span><input className="field mt-2" onChange={(event) => setTestSubject(event.target.value)} required value={testSubject} /></label>
          <label><span className="field-label">Cuerpo</span><textarea className="field-textarea mt-2" onChange={(event) => setTestBody(event.target.value)} required rows={4} value={testBody} /></label>
          <button className="button-primary" disabled={sendingTest || loading} type="submit">{sendingTest ? "Encolando..." : "Enviar prueba a la cola"}</button>
        </form>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Ultimas salidas</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando salidas.</p> : rows.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay salidas en cola.</p> : rows.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.asunto}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{channelLabels[item.canal]} · {item.destinatario_ref ?? item.destinatario_email ?? "sin destino"}</p></div><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.cuerpo}</p><div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{item.proveedor ?? "sin proveedor"}</span><span>{new Date(item.created_at).toLocaleString("es-AR")}</span></div>{item.error_message ? <p className="mt-2 text-sm leading-7 text-amber-700">{item.error_message}</p> : null}</div>)}
          </div>
        </article>
      </div>
    </section>
  );
}
