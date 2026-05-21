"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRecord } from "@/lib/auth-types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PendingResident = Pick<
  ProfileRecord,
  "id" | "nombre" | "apellido" | "email" | "telefono" | "dni" | "unidad_funcional" | "estado" | "es_menor" | "adulto_responsable_email"
> & {
  rol: "residente" | "admin";
};

export function AdminApprovalsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [pendingResidents, setPendingResidents] = useState<PendingResident[]>([]);
  const [scopeMessage, setScopeMessage] = useState("");
  const [loading, setLoading] = useState(() => configured);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPendingResidents = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);

    const { data: actingProfile, error: actingProfileError } = await supabase
      .from("profiles")
      .select("consorcio_id, rol")
      .eq("id", userId)
      .maybeSingle();

    if (actingProfileError) {
      setError(actingProfileError.message);
      setLoading(false);
      return;
    }

    const actingRole = (actingProfile as Pick<ProfileRecord, "rol" | "consorcio_id"> | null)?.rol ?? null;
    const actingConsorcioId = (actingProfile as Pick<ProfileRecord, "rol" | "consorcio_id"> | null)?.consorcio_id ?? null;

    if (actingRole !== "admin" && actingRole !== "superadmin") {
      setError("La sesion actual no tiene permisos para revisar solicitudes.");
      setPendingResidents([]);
      setLoading(false);
      return;
    }

    if (actingRole !== "superadmin" && !actingConsorcioId) {
      setError("Tu perfil no esta vinculado a un consorcio para revisar solicitudes.");
      setPendingResidents([]);
      setLoading(false);
      return;
    }

    setScopeMessage(
      actingRole === "superadmin"
        ? "Se muestran solicitudes pendientes de toda la plataforma."
        : "Se muestran solo las solicitudes pendientes vinculadas a tu consorcio.",
    );

    const query = supabase
      .from("profiles")
      .select("id, nombre, apellido, email, telefono, dni, unidad_funcional, estado, rol, es_menor, adulto_responsable_email")
      .eq("estado", "pendiente")
      .in("rol", ["residente", "admin"])
      .order("created_at", { ascending: true });

    const { data, error: loadError } = actingRole === "superadmin"
      ? await query
      : await query.eq("consorcio_id", actingConsorcioId);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setPendingResidents((data as PendingResident[] | null) ?? []);
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
        await loadPendingResidents(data.session.user.id);
      } else {
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadPendingResidents, supabase]);

  async function reviewResident(profileId: string, nextStatus: "activo" | "rechazado", nextRole: "residente" | "admin") {
    if (!supabase) {
      return;
    }

    setBusyProfileId(profileId);
    setError("");
    setMessage("");

    const { error: reviewError } = await supabase.rpc("review_profile_request", {
      p_profile_id: profileId,
      p_estado: nextStatus,
      p_rol: nextRole,
    });

    if (reviewError) {
      setError(reviewError.message);
      setBusyProfileId(null);
      return;
    }

    setMessage(
      nextStatus === "activo"
        ? `${nextRole === "admin" ? "Administrador" : "Residente"} aprobado y listo para ingresar.`
        : "Solicitud rechazada correctamente.",
    );
    if (session?.user) {
      await loadPendingResidents(session.user.id);
    }
    setBusyProfileId(null);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Aprobaciones reales
          </p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Altas pendientes del consorcio
          </h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">
          Este panel consume datos reales desde Supabase y permite activar o rechazar residentes y administradores en estado pendiente.
        </p>
      </div>

      {scopeMessage ? <p className="mt-4 text-sm leading-7 text-slate-500">{scopeMessage}</p> : null}

      {error ? (
        <article className="role-card mt-6 border-amber-200 bg-amber-50/80">
          <p className="text-sm font-semibold text-amber-700">Error</p>
          <p className="mt-2 text-sm leading-7 text-amber-700">{error}</p>
        </article>
      ) : null}

      {message ? (
        <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80">
          <p className="text-sm font-semibold text-emerald-700">Estado</p>
          <p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p>
        </article>
      ) : null}

      {loading ? (
        <div className="role-card mt-6">
          <p className="text-sm leading-7 text-slate-700">Cargando solicitudes pendientes.</p>
        </div>
      ) : pendingResidents.length === 0 ? (
        <div className="role-card mt-6">
          <p className="text-sm font-semibold text-slate-500">Sin pendientes</p>
          <p className="mt-2 text-base leading-7 text-slate-700">
            No hay solicitudes de acceso pendientes en este consorcio.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {pendingResidents.map((resident) => (
            <article className="role-card" key={resident.id}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-2xl font-semibold text-slate-950">
                    {resident.nombre} {resident.apellido}
                  </h4>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                    {resident.rol === "admin" ? "Administrador" : "Residente"}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm leading-7 text-slate-600 md:grid-cols-2">
                    <p>Email: {resident.email}</p>
                    <p>Unidad: {resident.rol === "admin" ? "No aplica" : resident.unidad_funcional ?? "Sin informar"}</p>
                    <p>Telefono: {resident.telefono ?? "Sin informar"}</p>
                    <p>DNI: {resident.dni ?? "Sin informar"}</p>
                    {resident.es_menor ? <p>Perfil: menor dependiente</p> : null}
                    {resident.es_menor ? <p>Adulto responsable: {resident.adulto_responsable_email ?? "Sin definir"}</p> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="button-primary"
                    disabled={busyProfileId === resident.id}
                    onClick={() => void reviewResident(resident.id, "activo", resident.rol)}
                    type="button"
                  >
                    {busyProfileId === resident.id ? "Procesando..." : "Aprobar"}
                  </button>
                  <button
                    className="button-secondary"
                    disabled={busyProfileId === resident.id}
                    onClick={() => void reviewResident(resident.id, "rechazado", resident.rol)}
                    type="button"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}