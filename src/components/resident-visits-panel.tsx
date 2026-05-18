"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import Image from "next/image";
import QRCode from "qrcode";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type GuardPost = {
  id: string;
  nombre: string;
  ubicacion: string | null;
};

type VisitRow = {
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
  compartir_whatsapp: boolean;
  puntos_vigilancia: { nombre: string | null } | null;
};

type VisitRowResponse = Omit<VisitRow, "puntos_vigilancia"> & {
  puntos_vigilancia: { nombre: string | null } | Array<{ nombre: string | null }> | null;
};

function normalizeGuardPostRelation(value: VisitRowResponse["puntos_vigilancia"]) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildVisitQrPayload(visit: VisitRow) {
  return JSON.stringify({
    token: visit.qr_token,
    visitante: visit.visitante_nombre,
    dni: visit.visitante_dni,
    fecha: visit.fecha_visita,
    desde: visit.hora_desde,
    hasta: visit.hora_hasta,
    punto: visit.puntos_vigilancia?.nombre ?? null,
    telefono: visit.telefono_contacto,
    patente: visit.patente_vehiculo,
    invitados: visit.cantidad_invitados,
    observaciones: visit.observaciones,
  });
}

function buildWhatsAppLink(visit: VisitRow) {
  if (!visit.telefono_contacto) {
    return "";
  }

  const normalizedPhone = visit.telefono_contacto.replace(/\D/g, "");
  if (!normalizedPhone) {
    return "";
  }

  const message = [
    `Visita autorizada para ${visit.visitante_nombre}.`,
    `Codigo QR: ${visit.qr_token}.`,
    `Fecha: ${new Date(visit.fecha_visita).toLocaleDateString("es-AR")}.`,
    visit.hora_desde ? `Ingreso: ${visit.hora_desde.slice(0, 5)}.` : null,
    visit.hora_hasta ? `Salida: ${visit.hora_hasta.slice(0, 5)}.` : "Sin horario de salida fijado.",
    visit.puntos_vigilancia?.nombre ? `Punto: ${visit.puntos_vigilancia.nombre}.` : null,
    visit.patente_vehiculo ? `Patente: ${visit.patente_vehiculo}.` : null,
    visit.cantidad_invitados > 1 ? `Personas autorizadas: ${visit.cantidad_invitados}.` : null,
    visit.observaciones ? `Observaciones: ${visit.observaciones}.` : null,
  ].filter(Boolean).join(" ");

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export function ResidentVisitsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [posts, setPosts] = useState<GuardPost[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [dni, setDni] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromTime, setFromTime] = useState("18:00");
  const [toTime, setToTime] = useState("20:00");
  const [withoutEndTime, setWithoutEndTime] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [phone, setPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [guestsCount, setGuestsCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [shareOnWhatsApp, setShareOnWhatsApp] = useState(false);

  const loadPosts = useCallback(async () => {
    if (!supabase) {
      return [] as GuardPost[];
    }

    const { data, error: loadError } = await supabase
      .from("puntos_vigilancia")
      .select("id, nombre, ubicacion")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (loadError) {
      throw loadError;
    }

    const nextPosts = (data as GuardPost[] | null) ?? [];
    setPosts(nextPosts);
    setSelectedPostId((current) => current || nextPosts[0]?.id || "");
    return nextPosts;
  }, [supabase]);

  const loadVisits = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("autorizaciones_visitas")
      .select("id, visitante_nombre, visitante_dni, fecha_visita, hora_desde, hora_hasta, qr_token, estado, punto_vigilancia_id, telefono_contacto, patente_vehiculo, cantidad_invitados, observaciones, compartir_whatsapp, puntos_vigilancia(nombre)")
      .eq("residente_id", userId)
      .order("fecha_visita", { ascending: false })
      .limit(8);
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const nextRows = ((data as VisitRowResponse[] | null) ?? []).map((item) => ({
      ...item,
      puntos_vigilancia: normalizeGuardPostRelation(item.puntos_vigilancia),
    }));
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
        try {
          await loadPosts();
        } catch (loadPostsError) {
          setError(loadPostsError instanceof Error ? loadPostsError.message : "No se pudieron cargar los puntos de vigilancia.");
        }
        await loadVisits(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadPosts, loadVisits, supabase]);

  useEffect(() => {
    let ignore = false;

    const generateQrImages = async () => {
      const missingRows = rows.filter((item) => !qrImages[item.id]);

      if (missingRows.length === 0) {
        return;
      }

      const entries = await Promise.all(
        missingRows.map(async (item) => {
          const image = await QRCode.toDataURL(buildVisitQrPayload(item), {
            margin: 1,
            width: 180,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });

          return [item.id, image] as const;
        }),
      );

      if (ignore) {
        return;
      }

      setQrImages((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    };

    void generateQrImages();

    return () => {
      ignore = true;
    };
  }, [qrImages, rows]);

  function handleDownloadQr(visit: VisitRow) {
    const image = qrImages[visit.id];

    if (!image) {
      return;
    }

    const link = document.createElement("a");
    link.href = image;
    link.download = `visita-${visit.qr_token}.png`;
    link.click();
  }

  async function handleCopyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setMessage(`Codigo ${token} copiado al portapapeles.`);
    } catch {
      setError("No se pudo copiar el codigo.");
    }
  }

  function openWhatsAppShare(visit: VisitRow) {
    const link = buildWhatsAppLink(visit);
    if (!link) {
      setError("Esta visita no tiene un telefono de WhatsApp cargado.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { data, error: createError } = await supabase.rpc("create_visit_authorization", {
      p_visitante_nombre: name,
      p_visitante_dni: dni,
      p_fecha_visita: date,
      p_hora_desde: fromTime,
      p_hora_hasta: withoutEndTime ? null : toTime,
      p_punto_vigilancia_id: selectedPostId || null,
      p_telefono_contacto: phone || null,
      p_patente_vehiculo: vehiclePlate || null,
      p_cantidad_invitados: Number(guestsCount || 1),
      p_observaciones: notes || null,
      p_compartir_whatsapp: shareOnWhatsApp,
    });
    if (createError) {
      setError(createError.message);
      setSaving(false);
      return;
    }
    const token = Array.isArray(data) ? data[0]?.qr_token : undefined;
    setName("");
    setDni("");
    setPhone("");
    setVehiclePlate("");
    setGuestsCount("1");
    setNotes("");
    setWithoutEndTime(false);
    setShareOnWhatsApp(false);
    setMessage(token ? `Visita autorizada. Codigo generado: ${token}` : "Visita autorizada correctamente.");
    await loadVisits(session.user.id);
    setSaving(false);

    if (shareOnWhatsApp && phone && token) {
      const createdVisit = (await supabase
        .from("autorizaciones_visitas")
        .select("id, visitante_nombre, visitante_dni, fecha_visita, hora_desde, hora_hasta, qr_token, estado, punto_vigilancia_id, telefono_contacto, patente_vehiculo, cantidad_invitados, observaciones, compartir_whatsapp, puntos_vigilancia(nombre)")
        .eq("residente_id", session.user.id)
        .eq("qr_token", token)
        .maybeSingle()).data as VisitRow | null;

      if (createdVisit) {
        openWhatsAppShare(createdVisit);
      }
    }
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Visitas reales</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Autorizar ingresos con datos operativos reales</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Ahora cada visita puede asociarse a una porteria, patente, cantidad de personas, observaciones y compartir un mensaje listo para WhatsApp.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.98fr_1.02fr]">
        <form className="role-card grid gap-4" onSubmit={handleSubmit}>
          <label><span className="field-label">Nombre del visitante</span><input className="field mt-2" onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label><span className="field-label">DNI</span><input className="field mt-2" onChange={(event) => setDni(event.target.value)} required value={dni} /></label>
          <label><span className="field-label">Fecha</span><input className="field mt-2" onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="field-label">Desde</span><input className="field mt-2" onChange={(event) => setFromTime(event.target.value)} required type="time" value={fromTime} /></label>
            <label><span className="field-label">Hasta</span><input className="field mt-2" disabled={withoutEndTime} onChange={(event) => setToTime(event.target.value)} required={!withoutEndTime} type="time" value={toTime} /></label>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-700"><input checked={withoutEndTime} className="size-4" onChange={(event) => setWithoutEndTime(event.target.checked)} type="checkbox" /><span>Sin horario de salida fijado</span></label>
          {posts.length > 0 ? <label><span className="field-label">Punto de vigilancia</span><select className="field-select mt-2" onChange={(event) => setSelectedPostId(event.target.value)} value={selectedPostId}><option value="">Sin punto especifico</option>{posts.map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.ubicacion ? ` · ${item.ubicacion}` : ""}</option>)}</select></label> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="field-label">WhatsApp de envio</span><input className="field mt-2" onChange={(event) => setPhone(event.target.value)} placeholder="Ej: 54911..." value={phone} /></label>
            <label><span className="field-label">Patente</span><input className="field mt-2" onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())} placeholder="Ej: AB123CD" value={vehiclePlate} /></label>
          </div>
          <label><span className="field-label">Cantidad de personas</span><input className="field mt-2" min="1" onChange={(event) => setGuestsCount(event.target.value)} type="number" value={guestsCount} /></label>
          <label><span className="field-label">Observaciones</span><textarea className="field-textarea mt-2" onChange={(event) => setNotes(event.target.value)} placeholder="Ej: delivery, mudanza corta o visita con herramientas" rows={3} value={notes} /></label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-700"><input checked={shareOnWhatsApp} className="size-4" onChange={(event) => setShareOnWhatsApp(event.target.checked)} type="checkbox" /><span>Abrir WhatsApp automaticamente al generar el QR</span></label>
          <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Autorizando..." : "Autorizar visita"}</button>
        </form>
        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Mis autorizaciones</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando visitas.</p> : rows.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no generaste autorizaciones.</p> : rows.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.visitante_nombre}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">DNI {item.visitante_dni}</p><div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{new Date(item.fecha_visita).toLocaleDateString("es-AR")}</span><span>{(item.hora_desde ?? "--:--").slice(0,5)} a {item.hora_hasta ? item.hora_hasta.slice(0,5) : "sin salida"}</span><span>QR {item.qr_token}</span>{item.puntos_vigilancia?.nombre ? <span>{item.puntos_vigilancia.nombre}</span> : null}</div><div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">{item.telefono_contacto ? <span>WhatsApp {item.telefono_contacto}</span> : null}{item.patente_vehiculo ? <span>Patente {item.patente_vehiculo}</span> : null}<span>{item.cantidad_invitados} persona{item.cantidad_invitados === 1 ? "" : "s"}</span></div>{item.observaciones ? <p className="mt-2 text-sm leading-7 text-slate-600">{item.observaciones}</p> : null}<div className="mt-4 flex flex-wrap gap-3"><button className="button-secondary" onClick={() => handleDownloadQr(item)} type="button">Descargar QR</button><button className="button-secondary" onClick={() => void handleCopyToken(item.qr_token)} type="button">Copiar codigo</button>{item.telefono_contacto ? <button className="button-secondary" onClick={() => openWhatsAppShare(item)} type="button">Enviar por WhatsApp</button> : null}</div></div><div className="flex w-full max-w-[180px] flex-col items-center rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-3">{qrImages[item.id] ? <Image alt={`QR de visita para ${item.visitante_nombre}`} className="rounded-2xl bg-white p-2" height={150} src={qrImages[item.id]} unoptimized width={150} /> : <div className="flex h-[150px] w-[150px] items-center justify-center rounded-2xl bg-white text-xs uppercase tracking-[0.18em] text-slate-400">Generando QR</div>}<p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Presentar en porteria</p></div></div></div>)}
          </div>
        </article>
      </div>
    </section>
  );
}
