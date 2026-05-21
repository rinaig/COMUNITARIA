"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId, OPERATIONS_BUCKET, uploadTenantFile } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type ClaimRow = {
  id: string;
  titulo: string;
  categoria: string | null;
  estado: string;
  descripcion: string;
  foto_url: string | null;
  visible_para_todo_consorcio: boolean;
  created_at: string;
};

export function ResidentClaimsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [sharedClaims, setSharedClaims] = useState<ClaimRow[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [visibleToCommunity, setVisibleToCommunity] = useState(true);

  const loadClaims = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }
    setLoading(true);
    const [ownClaimsResult, sharedClaimsResult] = await Promise.all([
      supabase
        .from("reclamos")
        .select("id, titulo, categoria, estado, descripcion, foto_url, visible_para_todo_consorcio, created_at")
        .eq("creador_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("reclamos")
        .select("id, titulo, categoria, estado, descripcion, foto_url, visible_para_todo_consorcio, created_at")
        .eq("visible_para_todo_consorcio", true)
        .neq("creador_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const loadError = ownClaimsResult.error ?? sharedClaimsResult.error;
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setClaims((ownClaimsResult.data as ClaimRow[] | null) ?? []);
    setSharedClaims((sharedClaimsResult.data as ClaimRow[] | null) ?? []);
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
        await loadClaims(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadClaims, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session?.user) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");

    let photoUrl = "";
    if (photoFile) {
      try {
        const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
        const upload = await uploadTenantFile(supabase, OPERATIONS_BUCKET, consorcioId, photoFile, "claims");
        photoUrl = upload.publicUrl;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir la foto.");
        setSaving(false);
        return;
      }
    }

    const { error: createError } = await supabase.rpc("create_claim_ticket", {
      p_titulo: title,
      p_categoria: category,
      p_descripcion: description,
      p_foto_url: photoUrl,
      p_visible_para_todo_consorcio: visibleToCommunity,
    });

    if (createError) {
      setError(createError.message);
      setSaving(false);
      return;
    }

    setTitle("");
    setCategory("");
    setDescription("");
    setPhotoFile(null);
    setVisibleToCommunity(true);
    setMessage("Reclamo creado correctamente.");
    await loadClaims(session.user.id);
    setSaving(false);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Reclamos reales</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Crear y seguir tickets desde tu unidad</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">El ticket se registra en la base y puede incluir foto subida a Storage.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form className="role-card grid gap-4" onSubmit={handleSubmit}>
          <label><span className="field-label">Titulo</span><input className="field mt-2" onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          <label><span className="field-label">Categoria</span><input className="field mt-2" onChange={(event) => setCategory(event.target.value)} placeholder="Ej: Iluminacion" value={category} /></label>
          <label><span className="field-label">Descripcion</span><textarea className="field-textarea mt-2" onChange={(event) => setDescription(event.target.value)} required value={description} /></label>
          <label><span className="field-label">Foto opcional</span><input className="field mt-2" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} type="file" /></label>
          <p className="text-sm leading-7 text-slate-600">Las imagenes se optimizan automaticamente a WebP, con ancho maximo de 1200 px y tope final de 3 MB.</p>
          <label className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-600">
            <span className="flex items-center gap-3">
              <input checked={visibleToCommunity} className="h-4 w-4" onChange={(event) => setVisibleToCommunity(event.target.checked)} type="checkbox" />
              <span>
                Mostrar este reclamo al resto del consorcio para evitar duplicados en areas comunes.
              </span>
            </span>
          </label>
          <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Creando..." : "Crear reclamo"}</button>
        </form>
        <div className="grid gap-6">
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Mis reclamos</p>
            <div className="mt-4 grid gap-3">
              {loading ? <p className="text-sm leading-7 text-slate-600">Cargando reclamos.</p> : claims.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no cargaste reclamos.</p> : claims.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.categoria ?? "Sin categoria"}</p><p className="mt-2 text-sm leading-7 text-slate-600">{item.descripcion}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{new Date(item.created_at).toLocaleDateString("es-AR")}</span><span>{item.visible_para_todo_consorcio ? "Visible al consorcio" : "Solo administracion"}</span>{item.foto_url ? <a href={item.foto_url} rel="noreferrer" target="_blank">Ver adjunto</a> : <span>Sin adjunto</span>}</div></div>)}
            </div>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Reclamos compartidos</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">Incidencias visibles del consorcio para evitar duplicar reportes sobre areas comunes.</p>
            <div className="mt-4 grid gap-3">
              {loading ? <p className="text-sm leading-7 text-slate-600">Cargando reclamos compartidos.</p> : sharedClaims.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay reclamos compartidos visibles.</p> : sharedClaims.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.categoria ?? "Sin categoria"}</p><p className="mt-2 text-sm leading-7 text-slate-600">{item.descripcion}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{new Date(item.created_at).toLocaleDateString("es-AR")}</span>{item.foto_url ? <a href={item.foto_url} rel="noreferrer" target="_blank">Ver adjunto</a> : <span>Sin adjunto</span>}</div></div>)}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}