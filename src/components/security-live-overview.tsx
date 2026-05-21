"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type BarcodeDetectorScanResult = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorScanResult[]>;
};
type BarcodeDetectorConstructorLike = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructorLike;
  }
}

type Metric = { label: string; value: string; detail: string };
type GuardPost = { id: string; nombre: string; ubicacion: string | null; activo: boolean };
type GuardAssignment = { punto_id: string; guardia_id: string };
type Visit = {
  id: string;
  visitante_nombre: string;
  visitante_dni: string;
  fecha_visita: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  qr_token: string;
  estado: string;
  punto_vigilancia_id: string | null;
  telefono_contacto: string | null;
  patente_vehiculo: string | null;
  cantidad_invitados: number;
  observaciones: string | null;
  puntos_vigilancia: { nombre: string | null } | null;
};
type ProviderDoc = { id: string; proveedor_id: string; tipo: string; requisito_id: string | null; nombre_documento: string | null; vence_el: string };
type ProviderRequirement = { id: string; nombre: string; codigo: string; requerido: boolean; dias_alerta: number };
type Provider = { id: string; nombre: string; empresa: string | null };
type Entry = { id: string; descripcion: string; ingreso_at: string; punto_vigilancia_id: string | null; puntos_vigilancia: { nombre: string | null } | null };

function normalizeScannedToken(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as { token?: string };
    return typeof parsed.token === "string" ? parsed.token.trim().toUpperCase() : trimmed.toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

export function SecurityLiveOverview() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerSupported = typeof window !== "undefined" && Boolean(window.BarcodeDetector && navigator.mediaDevices?.getUserMedia);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [validating, setValidating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [providerAlerts, setProviderAlerts] = useState<Array<{ title: string; detail: string; status: string }>>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [posts, setPosts] = useState<GuardPost[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedPointId, setSelectedPointId] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [token, setToken] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [providerEntryNote, setProviderEntryNote] = useState("");

  const stopScanner = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScannerOpen(false);
    setScannerStatus("");
  }, []);

  const loadOverview = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");
    const today = new Date().toISOString().slice(0, 10);

    const [visitsResult, providerDocsResult, providersResult, requirementsResult, entriesResult, postsResult, assignmentsResult] = await Promise.all([
      supabase.from("autorizaciones_visitas").select("id, visitante_nombre, visitante_dni, fecha_visita, hora_desde, hora_hasta, qr_token, estado, punto_vigilancia_id, telefono_contacto, patente_vehiculo, cantidad_invitados, observaciones, puntos_vigilancia(nombre)").gte("fecha_visita", today).order("fecha_visita", { ascending: true }).limit(10),
      supabase.from("proveedor_documentos").select("id, proveedor_id, tipo, requisito_id, nombre_documento, vence_el").order("vence_el", { ascending: true }).limit(50),
      supabase.from("proveedores").select("id, nombre, empresa").eq("activo", true).limit(20),
      supabase.from("proveedor_documento_requisitos").select("id, nombre, codigo, requerido, dias_alerta").order("nombre", { ascending: true }).limit(30),
      supabase.from("ingresos_guardia").select("id, descripcion, ingreso_at, punto_vigilancia_id, puntos_vigilancia(nombre)").order("ingreso_at", { ascending: false }).limit(8),
      supabase.from("puntos_vigilancia").select("id, nombre, ubicacion, activo").eq("activo", true).order("nombre", { ascending: true }),
      supabase.from("punto_vigilancia_guardias").select("punto_id, guardia_id").eq("guardia_id", userId),
    ]);

    const firstError = [visitsResult.error, providerDocsResult.error, providersResult.error, requirementsResult.error, entriesResult.error, postsResult.error, assignmentsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const allPosts = (postsResult.data as GuardPost[] | null) ?? [];
    const guardAssignments = (assignmentsResult.data as GuardAssignment[] | null) ?? [];
    const assignedPointIds = new Set(guardAssignments.map((item) => item.punto_id));
    const visiblePosts = assignedPointIds.size > 0 ? allPosts.filter((item) => assignedPointIds.has(item.id)) : allPosts;
    const nextProviders = (providersResult.data as Provider[] | null) ?? [];
    setPosts(visiblePosts);
    setSelectedPointId((current) => current || visiblePosts[0]?.id || "");
    setProviders(nextProviders);
    setSelectedProviderId((current) => current || nextProviders[0]?.id || "");

    const nextVisits = ((visitsResult.data as Visit[] | null) ?? []).filter((item) => !visiblePosts.length || !item.punto_vigilancia_id || visiblePosts.some((post) => post.id === item.punto_vigilancia_id));
    const nextDocs = (providerDocsResult.data as ProviderDoc[] | null) ?? [];
    const requirements = (requirementsResult.data as ProviderRequirement[] | null) ?? [];
    const providersById = nextProviders.reduce<Record<string, Provider>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    const providerDocsByProvider = nextDocs.reduce<Record<string, ProviderDoc[]>>((acc, item) => {
      acc[item.proveedor_id] ??= [];
      acc[item.proveedor_id].push(item);
      return acc;
    }, {});

    const providerAlertsRaw = Object.values(providersById).flatMap((provider) => {
      const providerDocs = providerDocsByProvider[provider.id] ?? [];
      const docsByRequirement = new Map(providerDocs.map((doc) => [doc.requisito_id ?? doc.tipo, doc]));

      return requirements.flatMap((requirement) => {
        const doc = docsByRequirement.get(requirement.id) ?? docsByRequirement.get(requirement.codigo);
        if (!doc) {
          return requirement.requerido ? [{
            title: provider.nombre,
            detail: `${requirement.nombre} obligatorio sin cargar`,
            status: "bloquear ingreso",
          }] : [];
        }

        const expiresAt = new Date(doc.vence_el);
        const alertDate = new Date(expiresAt);
        alertDate.setDate(alertDate.getDate() - requirement.dias_alerta);

        if (doc.vence_el < today) {
          return [{
            title: provider.nombre,
            detail: `${requirement.nombre} vencido el ${new Date(doc.vence_el).toLocaleDateString("es-AR")}`,
            status: requirement.requerido ? "bloquear ingreso" : "revisar",
          }];
        }

        if (alertDate.toISOString().slice(0, 10) <= today) {
          return [{
            title: provider.nombre,
            detail: `${requirement.nombre} vence el ${new Date(doc.vence_el).toLocaleDateString("es-AR")}`,
            status: "alerta previa",
          }];
        }

        return [];
      });
    });

    setMetrics([
      { label: "Puestos activos", value: String(visiblePosts.length), detail: visiblePosts[0]?.nombre ?? "Sin asignacion puntual" },
      { label: "Visitas proximas", value: String(nextVisits.length), detail: "Autorizaciones a controlar" },
      { label: "Alertas proveedor", value: String(providerAlertsRaw.length), detail: "Faltantes y vencimientos" },
      { label: "Ingresos recientes", value: String((entriesResult.data ?? []).length), detail: "Ultimos movimientos de guardia" },
    ]);

    setVisits(nextVisits);
    setEntries((entriesResult.data as Entry[] | null) ?? []);
    setProviderAlerts(providerAlertsRaw.slice(0, 8));
    setLoading(false);
  }, [supabase]);

  const validateEntry = useCallback(async (rawToken: string) => {
    if (!supabase) {
      return;
    }

    const normalizedToken = rawToken.trim().toUpperCase();

    if (!normalizedToken) {
      setError("Ingresa un codigo QR o token para validar.");
      return;
    }

    setValidating(true);
    setError("");
    setMessage("");

    const { data, error: validationError } = await supabase.rpc("validate_visit_entry", {
      p_qr_token: normalizedToken,
      p_note: entryNote,
      p_punto_vigilancia_id: selectedPointId || null,
    });

    if (validationError) {
      setError(validationError.message);
      setValidating(false);
      return;
    }

    const visitorName = Array.isArray(data) ? data[0]?.visitante_nombre : undefined;
    setToken("");
    setEntryNote("");
    stopScanner();
    setMessage(visitorName ? `Ingreso registrado para ${visitorName}.` : "Ingreso registrado correctamente.");
    if (session?.user) {
      await loadOverview(session.user.id);
    }
    setValidating(false);
  }, [entryNote, loadOverview, selectedPointId, session, stopScanner, supabase]);

  const registerProviderEntry = useCallback(async () => {
    if (!supabase) {
      return;
    }

    if (!selectedProviderId) {
      setError("Selecciona un proveedor para registrar el ingreso.");
      return;
    }

    setValidating(true);
    setError("");
    setMessage("");

    const { data, error: providerEntryError } = await supabase.rpc("register_provider_entry", {
      p_proveedor_id: selectedProviderId,
      p_note: providerEntryNote,
      p_punto_vigilancia_id: selectedPointId || null,
    });

    if (providerEntryError) {
      setError(providerEntryError.message);
      setValidating(false);
      return;
    }

    const providerName = Array.isArray(data) ? data[0]?.provider_name : undefined;
    setProviderEntryNote("");
    setMessage(providerName ? `Ingreso registrado para proveedor ${providerName}.` : "Ingreso de proveedor registrado correctamente.");
    if (session?.user) {
      await loadOverview(session.user.id);
    }
    setValidating(false);
  }, [loadOverview, providerEntryNote, selectedPointId, selectedProviderId, session, supabase]);

  const startScanner = useCallback(async () => {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setError("Este dispositivo no soporta escaneo por camara. Usa el token manual.");
      return;
    }

    try {
      setError("");
      setMessage("");
      setScannerStatus("Solicitando acceso a la camara...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;
      setScannerOpen(true);
      setScannerStatus("Alinea el QR dentro del encuadre.");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (cameraError) {
      setScannerStatus("");
      setError(cameraError instanceof Error ? cameraError.message : "No se pudo abrir la camara.");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await validateEntry(token);
  }

  useEffect(() => {
    if (!scannerOpen || !window.BarcodeDetector || !videoRef.current) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    const tick = async () => {
      if (cancelled || !videoRef.current || validating) {
        return;
      }

      try {
        const results = await detector.detect(videoRef.current);
        const rawValue = results[0]?.rawValue;

        if (rawValue) {
          const nextToken = normalizeScannedToken(rawValue);
          setToken(nextToken);
          setScannerStatus("QR detectado. Validando ingreso...");
          await validateEntry(nextToken);
          return;
        }
      } catch {
        setScannerStatus("No se pudo interpretar el QR. Reintenta el encuadre.");
      }

      timeoutId = setTimeout(() => {
        void tick();
      }, 500);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [scannerOpen, validateEntry, validating]);

  useEffect(() => () => {
    stopScanner();
  }, [stopScanner]);

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
        await loadOverview(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadOverview, supabase]);

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Panel en vivo</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Control real de ingresos por puesto</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Visitas, ingresos y alertas documentales tomadas del consorcio autenticado, ahora con operacion por porteria o punto asignado.</p>
      </div>
      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}
      {loading ? <div className="role-card mt-6"><p className="text-sm leading-7 text-slate-700">Cargando datos de seguridad.</p></div> : (
        <>
          <form className="role-card mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={handleSubmit}>
            <label>
              <span className="field-label">Punto de vigilancia</span>
              <select className="field-select mt-2" onChange={(event) => setSelectedPointId(event.target.value)} value={selectedPointId}>
                <option value="">Sin punto especifico</option>
                {posts.map((post) => <option key={post.id} value={post.id}>{post.nombre}{post.ubicacion ? ` · ${post.ubicacion}` : ""}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">Codigo QR o token</span>
              <input className="field mt-2" onChange={(event) => setToken(event.target.value)} placeholder="Ej: AB12CD34EF56" value={token} />
            </label>
            <label>
              <span className="field-label">Observacion opcional</span>
              <input className="field mt-2" onChange={(event) => setEntryNote(event.target.value)} placeholder="Ej: ingreso con bolso de herramientas" value={entryNote} />
            </label>
            <button className="button-primary self-end" disabled={validating} type="submit">{validating ? "Validando..." : "Registrar ingreso"}</button>
          </form>
          <article className="role-card mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className="field-label">Proveedor</span>
              <select className="field-select mt-2" onChange={(event) => setSelectedProviderId(event.target.value)} value={selectedProviderId}>
                <option value="">Selecciona un proveedor</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.nombre}{provider.empresa ? ` · ${provider.empresa}` : ""}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">Observacion proveedor</span>
              <input className="field mt-2" onChange={(event) => setProviderEntryNote(event.target.value)} placeholder="Ej: mantenimiento ascensor torre A" value={providerEntryNote} />
            </label>
            <button className="button-primary self-end" disabled={validating || providers.length === 0} onClick={() => void registerProviderEntry()} type="button">{validating ? "Validando..." : "Registrar proveedor"}</button>
          </article>
          <article className="role-card mt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Escaneo por camara</p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">Si el dispositivo soporta lectura de QR, seguridad puede validar el ingreso directamente desde la camara sin copiar el token.</p>
              </div>
              <div className="flex gap-3">
                <button className="button-secondary" disabled={!scannerSupported || scannerOpen || validating} onClick={() => void startScanner()} type="button">Abrir camara</button>
                <button className="button-secondary" disabled={!scannerOpen} onClick={stopScanner} type="button">Cerrar camara</button>
              </div>
            </div>
            {!scannerSupported ? <p className="mt-4 text-sm leading-7 text-slate-600">El navegador actual no expone BarcodeDetector o acceso a camara. Sigue disponible el token manual.</p> : null}
            {scannerOpen ? <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]"><div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950"><video autoPlay className="aspect-square w-full object-cover" muted playsInline ref={videoRef} /></div><div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-5"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Estado del escaner</p><p className="mt-3 text-base leading-7 text-slate-700">{scannerStatus || "Preparando camara..."}</p><p className="mt-4 text-sm leading-7 text-slate-600">Mantiene el mismo flujo de validacion del token manual y registra el ingreso apenas detecta un QR valido.</p></div></div> : null}
          </article>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <article className="role-card"><p className="text-sm uppercase tracking-[0.2em] text-slate-500">Visitas</p><div className="mt-4 grid gap-3">{visits.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay visitas proximas.</p> : visits.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.visitante_nombre}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">DNI {item.visitante_dni}</p><div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{new Date(item.fecha_visita).toLocaleDateString("es-AR")}</span><span>{(item.hora_desde ?? "--:--").slice(0, 5)} a {item.hora_hasta ? item.hora_hasta.slice(0, 5) : "sin salida"}</span>{item.puntos_vigilancia?.nombre ? <span>{item.puntos_vigilancia.nombre}</span> : null}</div><div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">{item.telefono_contacto ? <span>WhatsApp {item.telefono_contacto}</span> : null}{item.patente_vehiculo ? <span>Patente {item.patente_vehiculo}</span> : null}<span>{item.cantidad_invitados} persona{item.cantidad_invitados === 1 ? "" : "s"}</span></div>{item.observaciones ? <p className="mt-2 text-sm leading-7 text-slate-600">{item.observaciones}</p> : null}<div className="mt-4 flex flex-wrap gap-3"><button className="button-secondary" disabled={validating || item.estado !== "vigente"} onClick={() => void validateEntry(item.qr_token)} type="button">{item.estado === "vigente" ? "Registrar ingreso" : "Ya procesada"}</button><span className="rounded-full bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Token {item.qr_token}</span></div></div>)}</div></article>
            <article className="role-card"><p className="text-sm uppercase tracking-[0.2em] text-slate-500">Alertas proveedor</p><div className="mt-4 grid gap-3">{providerAlerts.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay alertas criticas hoy.</p> : providerAlerts.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={`${item.title}-${item.detail}`}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.title}</h4><span className="status-badge status-badge--warning">{item.status}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.detail}</p></div>)}</div></article>
            <article className="role-card"><p className="text-sm uppercase tracking-[0.2em] text-slate-500">Ingresos recientes</p><div className="mt-4 grid gap-3">{entries.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay ingresos registrados todavia.</p> : entries.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><h4 className="text-lg font-semibold text-slate-950">{item.descripcion}</h4>{item.puntos_vigilancia?.nombre ? <p className="mt-2 text-sm leading-7 text-slate-600">Punto {item.puntos_vigilancia.nombre}</p> : null}<p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.ingreso_at).toLocaleString("es-AR")}</p></div>)}</div></article>
          </div>
        </>
      )}
    </section>
  );
}