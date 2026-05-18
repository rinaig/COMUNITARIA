"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type ClaimStatus = "pendiente" | "en_presupuesto" | "en_reparacion" | "finalizado";

type ClaimItem = {
  id: string;
  titulo: string;
  categoria: string | null;
  estado: ClaimStatus;
  descripcion: string;
  foto_url: string | null;
  created_at: string;
};

type ClaimEvent = {
  id: string;
  reclamo_id: string;
  estado: ClaimStatus | null;
  comentario: string | null;
  created_at: string;
};

type Announcement = {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: number;
  publicado_at: string;
};

const claimStatuses: ClaimStatus[] = ["pendiente", "en_presupuesto", "en_reparacion", "finalizado"];

export function AdminOperationsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [savingClaim, setSavingClaim] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [claimEvents, setClaimEvents] = useState<ClaimEvent[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementPriority, setAnnouncementPriority] = useState("1");
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("pendiente");
  const [claimComment, setClaimComment] = useState("");

  const loadData = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const [announcementsResult, claimsResult, eventsResult] = await Promise.all([
      supabase.from("anuncios").select("id, titulo, contenido, prioridad, publicado_at").order("publicado_at", { ascending: false }).limit(5),
      supabase.from("reclamos").select("id, titulo, categoria, estado, descripcion, foto_url, created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("reclamo_eventos").select("id, reclamo_id, estado, comentario, created_at").order("created_at", { ascending: false }).limit(20),
    ]);

    const firstError = [announcementsResult.error, claimsResult.error, eventsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextClaims = (claimsResult.data as ClaimItem[] | null) ?? [];
    setAnnouncements((announcementsResult.data as Announcement[] | null) ?? []);
    setClaims(nextClaims);
    setClaimEvents((eventsResult.data as ClaimEvent[] | null) ?? []);

    if (!selectedClaimId && nextClaims[0]) {
      setSelectedClaimId(nextClaims[0].id);
      setClaimStatus(nextClaims[0].estado);
    }

    setLoading(false);
  }, [selectedClaimId, supabase]);

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
        await loadData();
      } else {
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadData, supabase]);

  async function handleAnnouncementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSavingAnnouncement(true);
    setError("");
    setMessage("");

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const { error: insertError } = await supabase.from("anuncios").insert({
        consorcio_id: consorcioId,
        autor_id: session.user.id,
        titulo: announcementTitle,
        contenido: announcementBody,
        prioridad: Number(announcementPriority),
      });

      if (insertError) {
        throw insertError;
      }

      setAnnouncementTitle("");
      setAnnouncementBody("");
      setAnnouncementPriority("1");
      setMessage("Anuncio publicado correctamente.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo publicar el anuncio.");
    }

    setSavingAnnouncement(false);
  }

  async function handleClaimUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedClaimId) {
      return;
    }

    setSavingClaim(true);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase.rpc("update_claim_ticket", {
      p_claim_id: selectedClaimId,
      p_estado: claimStatus,
      p_comentario: claimComment,
    });

    if (updateError) {
      setError(updateError.message);
      setSavingClaim(false);
      return;
    }

    setClaimComment("");
    setMessage("Reclamo actualizado correctamente.");
    await loadData();
    setSavingClaim(false);
  }

  const selectedClaim = claims.find((item) => item.id === selectedClaimId) ?? null;
  const selectedClaimHistory = claimEvents.filter((item) => item.reclamo_id === selectedClaimId).slice(0, 5);

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Operacion diaria</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Anuncios y reclamos ya operables desde administracion</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Este bloque completa dos modulos centrales del MVP: comunicacion formal del consorcio y seguimiento de tickets con historial.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <form className="role-card grid gap-4" onSubmit={handleAnnouncementSubmit}>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Publicar anuncio</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">Avisos, mantenimientos y comunicados visibles para residentes desde el portal.</p>
          </div>
          <label><span className="field-label">Titulo</span><input className="field mt-2" onChange={(event) => setAnnouncementTitle(event.target.value)} required value={announcementTitle} /></label>
          <label><span className="field-label">Contenido</span><textarea className="field-textarea mt-2" onChange={(event) => setAnnouncementBody(event.target.value)} required value={announcementBody} /></label>
          <label><span className="field-label">Prioridad</span><select className="field-select mt-2" onChange={(event) => setAnnouncementPriority(event.target.value)} value={announcementPriority}><option value="0">Baja</option><option value="1">Normal</option><option value="2">Alta</option></select></label>
          <button className="button-primary" disabled={savingAnnouncement || loading} type="submit">{savingAnnouncement ? "Publicando..." : "Publicar anuncio"}</button>

          <div className="mt-2 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando anuncios.</p> : announcements.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay anuncios publicados.</p> : announcements.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><span className="status-badge status-badge--neutral">P{item.prioridad}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.contenido}</p><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.publicado_at).toLocaleDateString("es-AR")}</p></div>)}
          </div>
        </form>

        <div className="grid gap-6">
          <form className="role-card grid gap-4" onSubmit={handleClaimUpdate}>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Gestionar reclamo</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">Actualizar estado y dejar trazabilidad interna para el ticket seleccionado.</p>
            </div>
            <label><span className="field-label">Reclamo</span><select className="field-select mt-2" onChange={(event) => { const nextId = event.target.value; setSelectedClaimId(nextId); const nextClaim = claims.find((item) => item.id === nextId); if (nextClaim) { setClaimStatus(nextClaim.estado); } }} value={selectedClaimId}>{claims.map((item) => <option key={item.id} value={item.id}>{item.titulo}</option>)}</select></label>
            <label><span className="field-label">Estado</span><select className="field-select mt-2" onChange={(event) => setClaimStatus(event.target.value as ClaimStatus)} value={claimStatus}>{claimStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Comentario</span><textarea className="field-textarea mt-2" onChange={(event) => setClaimComment(event.target.value)} placeholder="Ej: proveedor confirmado para el viernes" value={claimComment} /></label>
            <button className="button-primary" disabled={savingClaim || loading || !selectedClaimId} type="submit">{savingClaim ? "Actualizando..." : "Actualizar reclamo"}</button>
          </form>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Tickets recientes</p>
              <div className="mt-4 grid gap-3">
                {loading ? <p className="text-sm leading-7 text-slate-600">Cargando reclamos.</p> : claims.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay reclamos cargados.</p> : claims.map((item) => <button className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-colors hover:border-slate-300" key={item.id} onClick={() => { setSelectedClaimId(item.id); setClaimStatus(item.estado); }} type="button"><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.categoria ?? "Sin categoria"}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.created_at).toLocaleDateString("es-AR")}</p></button>)}
              </div>
            </article>

            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Historial del ticket</p>
              {selectedClaim ? <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4"><h4 className="text-lg font-semibold text-slate-950">{selectedClaim.titulo}</h4><p className="mt-2 text-sm leading-7 text-slate-600">{selectedClaim.descripcion}</p><div className="mt-3 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{selectedClaim.categoria ?? "Sin categoria"}</span><span>{new Date(selectedClaim.created_at).toLocaleDateString("es-AR")}</span>{selectedClaim.foto_url ? <a href={selectedClaim.foto_url} rel="noreferrer" target="_blank">Ver adjunto</a> : null}</div></div> : <p className="mt-4 text-sm leading-7 text-slate-600">Selecciona un reclamo para ver su detalle.</p>}
              <div className="mt-4 grid gap-3">
                {selectedClaimHistory.length === 0 ? <p className="text-sm leading-7 text-slate-600">Aun no hay historial adicional para este reclamo.</p> : selectedClaimHistory.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><span className="status-badge status-badge--neutral">{item.estado ?? "sin estado"}</span><span className="text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(item.created_at).toLocaleDateString("es-AR")}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.comentario ?? "Sin comentario adicional."}</p></div>)}
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}