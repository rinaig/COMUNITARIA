"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Channel = "email" | "whatsapp";

type IntegrationRow = {
  id: string;
  canal: Channel;
  proveedor: string;
  remitente: string | null;
  credenciales: Record<string, string> | null;
  modo_prueba: boolean;
  activo: boolean;
};

type IntegrationForm = {
  proveedor: string;
  remitente: string;
  campo1: string;
  campo2: string;
  campo3: string;
  campo4: string;
  modoPrueba: boolean;
  activo: boolean;
};

const channelMeta: Record<Channel, { title: string; description: string; labels: [string, string, string, string] }> = {
  email: {
    title: "Email saliente",
    description: "Configura SMTP o el proveedor de correo del consorcio para avisos, aprobaciones y bandeja transaccional.",
    labels: ["Host o endpoint SMTP", "Puerto o usuario tecnico", "Password / API key", "From email o alias"],
  },
  whatsapp: {
    title: "WhatsApp saliente",
    description: "Prepara las credenciales del proveedor para automatizar envios reales en lugar de depender solo de deeplinks.",
    labels: ["Cuenta / phone number ID", "Token / auth secret", "Endpoint o base URL", "Business ID / namespace"],
  },
};

function buildInitialForm(): Record<Channel, IntegrationForm> {
  return {
    email: {
      proveedor: "smtp",
      remitente: "",
      campo1: "",
      campo2: "",
      campo3: "",
      campo4: "",
      modoPrueba: true,
      activo: false,
    },
    whatsapp: {
      proveedor: "meta",
      remitente: "",
      campo1: "",
      campo2: "",
      campo3: "",
      campo4: "",
      modoPrueba: true,
      activo: false,
    },
  };
}

function buildFormFromRow(channel: Channel, row: IntegrationRow | null): IntegrationForm {
  const fallback = buildInitialForm()[channel];
  if (!row) {
    return fallback;
  }

  return {
    proveedor: row.proveedor || fallback.proveedor,
    remitente: row.remitente ?? "",
    campo1: row.credenciales?.campo1 ?? "",
    campo2: row.credenciales?.campo2 ?? "",
    campo3: row.credenciales?.campo3 ?? "",
    campo4: row.credenciales?.campo4 ?? "",
    modoPrueba: row.modo_prueba,
    activo: row.activo,
  };
}

export function AdminChannelIntegrationsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [savingChannel, setSavingChannel] = useState<Channel | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [forms, setForms] = useState<Record<Channel, IntegrationForm>>(() => buildInitialForm());

  const loadIntegrations = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("consorcio_channel_integrations")
      .select("id, canal, proveedor, remitente, credenciales, modo_prueba, activo")
      .order("canal", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const nextRows = (data as IntegrationRow[] | null) ?? [];
    setRows(nextRows);
    setForms({
      email: buildFormFromRow("email", nextRows.find((item) => item.canal === "email") ?? null),
      whatsapp: buildFormFromRow("whatsapp", nextRows.find((item) => item.canal === "whatsapp") ?? null),
    });
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
        await loadIntegrations();
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadIntegrations, supabase]);

  async function handleSave(channel: Channel) {
    if (!supabase || !session?.user) {
      return;
    }

    setSavingChannel(channel);
    setError("");
    setMessage("");

    const form = forms[channel];
    const { error: saveError } = await supabase.rpc("upsert_channel_integration", {
      p_canal: channel,
      p_proveedor: form.proveedor,
      p_remitente: form.remitente || null,
      p_credenciales: {
        campo1: form.campo1,
        campo2: form.campo2,
        campo3: form.campo3,
        campo4: form.campo4,
      },
      p_modo_prueba: form.modoPrueba,
      p_activo: form.activo,
    });

    if (saveError) {
      setError(saveError.message);
      setSavingChannel(null);
      return;
    }

    setMessage(`Configuracion de ${channelMeta[channel].title.toLowerCase()} guardada.`);
    await loadIntegrations();
    setSavingChannel(null);
  }

  function updateForm(channel: Channel, patch: Partial<IntegrationForm>) {
    setForms((current) => ({
      ...current,
      [channel]: {
        ...current[channel],
        ...patch,
      },
    }));
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Integraciones salientes</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Mail y WhatsApp configurables por consorcio</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">El administrador deja cargadas las credenciales del canal desde el portal, sin depender de cambios manuales en el codigo para cada edificio.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {(["email", "whatsapp"] as Channel[]).map((channel) => {
          const meta = channelMeta[channel];
          const form = forms[channel];
          const row = rows.find((item) => item.canal === channel) ?? null;
          return (
            <article className="role-card grid gap-4" key={channel}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{meta.title}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{meta.description}</p>
                </div>
                <span className={`status-badge ${row?.activo ? "status-badge--success" : "status-badge--neutral"}`}>{row?.activo ? "activo" : "inactivo"}</span>
              </div>

              <label><span className="field-label">Proveedor</span><input className="field mt-2" onChange={(event) => updateForm(channel, { proveedor: event.target.value })} value={form.proveedor} /></label>
              <label><span className="field-label">Remitente visible</span><input className="field mt-2" onChange={(event) => updateForm(channel, { remitente: event.target.value })} placeholder={channel === "email" ? "notificaciones@tuconsorcio.com" : "Porteria principal"} value={form.remitente} /></label>
              <label><span className="field-label">{meta.labels[0]}</span><input className="field mt-2" onChange={(event) => updateForm(channel, { campo1: event.target.value })} value={form.campo1} /></label>
              <label><span className="field-label">{meta.labels[1]}</span><input className="field mt-2" onChange={(event) => updateForm(channel, { campo2: event.target.value })} value={form.campo2} /></label>
              <label><span className="field-label">{meta.labels[2]}</span><input className="field mt-2" onChange={(event) => updateForm(channel, { campo3: event.target.value })} type="password" value={form.campo3} /></label>
              <label><span className="field-label">{meta.labels[3]}</span><input className="field mt-2" onChange={(event) => updateForm(channel, { campo4: event.target.value })} value={form.campo4} /></label>

              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-3"><input checked={form.modoPrueba} onChange={(event) => updateForm(channel, { modoPrueba: event.target.checked })} type="checkbox" />Modo prueba</label>
                <label className="flex items-center gap-3"><input checked={form.activo} onChange={(event) => updateForm(channel, { activo: event.target.checked })} type="checkbox" />Canal activo</label>
              </div>

              <button className="button-primary" disabled={savingChannel === channel || loading} onClick={() => void handleSave(channel)} type="button">{savingChannel === channel ? "Guardando..." : `Guardar ${meta.title.toLowerCase()}`}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
