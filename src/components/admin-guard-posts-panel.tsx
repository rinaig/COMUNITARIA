"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type GuardPost = {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  activo: boolean;
};

type SecurityProfile = {
  id: string;
  nombre: string;
  apellido: string;
};

type GuardAssignment = {
  id: string;
  punto_id: string;
  guardia_id: string;
};

export function AdminGuardPostsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState<GuardPost[]>([]);
  const [guards, setGuards] = useState<SecurityProfile[]>([]);
  const [assignments, setAssignments] = useState<GuardAssignment[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [busyAssignmentKey, setBusyAssignmentKey] = useState("");
  const [busyPostId, setBusyPostId] = useState("");

  const loadData = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const [postsResult, guardsResult, assignmentsResult] = await Promise.all([
      supabase.from("puntos_vigilancia").select("id, nombre, descripcion, ubicacion, activo").order("nombre", { ascending: true }),
      supabase.from("profiles").select("id, nombre, apellido").eq("rol", "seguridad").eq("estado", "activo").order("apellido", { ascending: true }).order("nombre", { ascending: true }),
      supabase.from("punto_vigilancia_guardias").select("id, punto_id, guardia_id"),
    ]);

    const firstError = [postsResult.error, guardsResult.error, assignmentsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setPosts((postsResult.data as GuardPost[] | null) ?? []);
    setGuards((guardsResult.data as SecurityProfile[] | null) ?? []);
    setAssignments((assignmentsResult.data as GuardAssignment[] | null) ?? []);
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

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const { error: insertError } = await supabase.from("puntos_vigilancia").insert({
        consorcio_id: consorcioId,
        nombre: name,
        descripcion: description || null,
        ubicacion: location || null,
      });

      if (insertError) {
        throw insertError;
      }

      setName("");
      setDescription("");
      setLocation("");
      setMessage("Punto de vigilancia creado correctamente.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo crear el punto de vigilancia.");
    }

    setSaving(false);
  }

  async function handleTogglePost(post: GuardPost) {
    if (!supabase) {
      return;
    }

    setBusyPostId(post.id);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase.from("puntos_vigilancia").update({ activo: !post.activo }).eq("id", post.id);

    if (updateError) {
      setError(updateError.message);
      setBusyPostId("");
      return;
    }

    setMessage(post.activo ? "Punto archivado." : "Punto reactivado.");
    await loadData();
    setBusyPostId("");
  }

  async function handleAssignmentToggle(postId: string, guardId: string) {
    if (!supabase || !session?.user) {
      return;
    }

    const key = `${postId}-${guardId}`;
    setBusyAssignmentKey(key);
    setError("");
    setMessage("");

    const existing = assignments.find((item) => item.punto_id === postId && item.guardia_id === guardId);

    if (existing) {
      const { error: deleteError } = await supabase.from("punto_vigilancia_guardias").delete().eq("id", existing.id);
      if (deleteError) {
        setError(deleteError.message);
        setBusyAssignmentKey("");
        return;
      }
      setMessage("Guardia removido del punto.");
    } else {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const { error: insertError } = await supabase.from("punto_vigilancia_guardias").insert({
        consorcio_id: consorcioId,
        punto_id: postId,
        guardia_id: guardId,
      });
      if (insertError) {
        setError(insertError.message);
        setBusyAssignmentKey("");
        return;
      }
      setMessage("Guardia asignado al punto.");
    }

    await loadData();
    setBusyAssignmentKey("");
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Seguridad fisica</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Puestos de vigilancia y guardias asignados</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Cada ingreso puede quedar vinculado a una porteria o puesto especifico, y seguridad puede operar por sector real.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <form className="role-card grid gap-4" onSubmit={handleCreatePost}>
          <label><span className="field-label">Nombre del puesto</span><input className="field mt-2" onChange={(event) => setName(event.target.value)} placeholder="Ej: Porteria principal" required value={name} /></label>
          <label><span className="field-label">Ubicacion</span><input className="field mt-2" onChange={(event) => setLocation(event.target.value)} placeholder="Ej: Acceso por calle Rivadavia" value={location} /></label>
          <label><span className="field-label">Descripcion</span><textarea className="field-textarea mt-2" onChange={(event) => setDescription(event.target.value)} placeholder="Cobertura, horario o notas operativas" rows={4} value={description} /></label>
          <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Guardando..." : "Crear punto de vigilancia"}</button>
        </form>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Puestos configurados</p>
          <div className="mt-4 grid gap-4">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando puestos.</p> : posts.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay puestos cargados.</p> : posts.map((post) => {
              const assignedGuardIds = assignments.filter((item) => item.punto_id === post.id).map((item) => item.guardia_id);
              return <div className="rounded-[1.6rem] border border-slate-200 bg-white/85 p-5" key={post.id}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h4 className="text-lg font-semibold text-slate-950">{post.nombre}</h4><span className={post.activo ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>{post.activo ? "activo" : "archivado"}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{post.ubicacion ?? "Sin ubicacion detallada"}</p>{post.descripcion ? <p className="mt-1 text-sm leading-7 text-slate-600">{post.descripcion}</p> : null}</div><button className="button-secondary" disabled={busyPostId === post.id} onClick={() => void handleTogglePost(post)} type="button">{busyPostId === post.id ? "Guardando..." : post.activo ? "Archivar" : "Reactivar"}</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{guards.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay perfiles de seguridad activos para asignar.</p> : guards.map((guard) => { const isAssigned = assignedGuardIds.includes(guard.id); const assignmentKey = `${post.id}-${guard.id}`; return <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700" key={guard.id}><input checked={isAssigned} className="size-4" disabled={busyAssignmentKey === assignmentKey} onChange={() => void handleAssignmentToggle(post.id, guard.id)} type="checkbox" /><span>{guard.nombre} {guard.apellido}</span></label>; })}</div></div>;
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
