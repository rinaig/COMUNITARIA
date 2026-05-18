"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Amenity = {
  id: string;
  nombre: string;
  capacidad: number | null;
  hora_apertura: string;
  hora_cierre: string;
  max_reservas_mensuales: number;
  anticipacion_min_horas: number;
  duracion_max_horas: number;
  requiere_aprobacion_manual: boolean;
  requiere_aceptacion_reglamento: boolean;
  activo: boolean;
};

function applyAmenityToForm(
  amenity: Amenity | null,
  setters: {
    setName: (value: string) => void;
    setCapacity: (value: string) => void;
    setOpeningTime: (value: string) => void;
    setClosingTime: (value: string) => void;
    setMonthlyLimit: (value: string) => void;
    setMinNoticeHours: (value: string) => void;
    setMaxDurationHours: (value: string) => void;
    setRequiresManualApproval: (value: boolean) => void;
    setRequiresRules: (value: boolean) => void;
  },
) {
  if (!amenity) {
    setters.setName("");
    setters.setCapacity("");
    setters.setOpeningTime("08:00");
    setters.setClosingTime("22:00");
    setters.setMonthlyLimit("2");
    setters.setMinNoticeHours("0");
    setters.setMaxDurationHours("4");
    setters.setRequiresManualApproval(false);
    setters.setRequiresRules(true);
    return;
  }

  setters.setName(amenity.nombre);
  setters.setCapacity(amenity.capacidad ? String(amenity.capacidad) : "");
  setters.setOpeningTime(amenity.hora_apertura.slice(0, 5));
  setters.setClosingTime(amenity.hora_cierre.slice(0, 5));
  setters.setMonthlyLimit(String(amenity.max_reservas_mensuales));
  setters.setMinNoticeHours(String(amenity.anticipacion_min_horas));
  setters.setMaxDurationHours(String(amenity.duracion_max_horas));
  setters.setRequiresManualApproval(amenity.requiere_aprobacion_manual);
  setters.setRequiresRules(amenity.requiere_aceptacion_reglamento);
}

export function AdminAmenitiesPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [selectedAmenityId, setSelectedAmenityId] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [openingTime, setOpeningTime] = useState("08:00");
  const [closingTime, setClosingTime] = useState("22:00");
  const [monthlyLimit, setMonthlyLimit] = useState("2");
  const [minNoticeHours, setMinNoticeHours] = useState("0");
  const [maxDurationHours, setMaxDurationHours] = useState("4");
  const [requiresManualApproval, setRequiresManualApproval] = useState(false);
  const [requiresRules, setRequiresRules] = useState(true);

  const syncAmenityForm = useCallback((amenity: Amenity | null) => {
    applyAmenityToForm(amenity, {
      setName,
      setCapacity,
      setOpeningTime,
      setClosingTime,
      setMonthlyLimit,
      setMinNoticeHours,
      setMaxDurationHours,
      setRequiresManualApproval,
      setRequiresRules,
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: amenitiesError } = await supabase
      .from("amenities")
      .select("id, nombre, capacidad, hora_apertura, hora_cierre, max_reservas_mensuales, anticipacion_min_horas, duracion_max_horas, requiere_aprobacion_manual, requiere_aceptacion_reglamento, activo")
      .order("activo", { ascending: false })
      .order("nombre", { ascending: true });

    if (amenitiesError) {
      setError(amenitiesError.message);
      setLoading(false);
      return;
    }

    const nextAmenities = (data as Amenity[] | null) ?? [];
    setAmenities(nextAmenities);

    const nextSelectedAmenityId = selectedAmenityId || nextAmenities[0]?.id || "";
    setSelectedAmenityId(nextSelectedAmenityId);
    syncAmenityForm(nextAmenities.find((item) => item.id === nextSelectedAmenityId) ?? null);
    setLoading(false);
  }, [selectedAmenityId, supabase, syncAmenityForm]);

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

  function handleAmenitySelection(nextAmenityId: string) {
    setSelectedAmenityId(nextAmenityId);
    syncAmenityForm(amenities.find((item) => item.id === nextAmenityId) ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const payload = {
        consorcio_id: consorcioId,
        nombre: name,
        capacidad: capacity ? Number(capacity) : null,
        hora_apertura: openingTime,
        hora_cierre: closingTime,
        max_reservas_mensuales: Number(monthlyLimit || 2),
        anticipacion_min_horas: Number(minNoticeHours || 0),
        duracion_max_horas: Number(maxDurationHours || 4),
        requiere_aprobacion_manual: requiresManualApproval,
        requiere_aceptacion_reglamento: requiresRules,
      };

      const query = selectedAmenityId
        ? supabase.from("amenities").update(payload).eq("id", selectedAmenityId)
        : supabase.from("amenities").insert(payload);

      const { error: saveError } = await query;
      if (saveError) {
        throw saveError;
      }

      setMessage(selectedAmenityId ? "Amenity actualizado correctamente." : "Amenity creado correctamente.");

      if (!selectedAmenityId) {
        syncAmenityForm(null);
      }

      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar el amenity.");
    }

    setSaving(false);
  }

  async function handleToggleAmenity(amenity: Amenity) {
    if (!supabase) {
      return;
    }

    setTogglingId(amenity.id);
    setError("");
    setMessage("");

    const { error: toggleError } = await supabase.from("amenities").update({ activo: !amenity.activo }).eq("id", amenity.id);

    if (toggleError) {
      setError(toggleError.message);
      setTogglingId("");
      return;
    }

    setMessage(amenity.activo ? "Amenity desactivado." : "Amenity reactivado.");
    await loadData();
    setTogglingId("");
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Amenities reales</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Alta, configuracion y disponibilidad</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Administracion puede crear amenities, ajustar horarios y pausar espacios sin intervenir directamente la base.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-6">
          <form className="role-card grid gap-4" onSubmit={handleSubmit}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Formulario de amenity</p>
              <button className="button-secondary" onClick={() => {
                setSelectedAmenityId("");
                syncAmenityForm(null);
                setMessage("");
                setError("");
              }} type="button">Nuevo</button>
            </div>
            <label><span className="field-label">Amenity</span><select className="field-select mt-2" onChange={(event) => handleAmenitySelection(event.target.value)} value={selectedAmenityId}><option value="">Nuevo amenity</option>{amenities.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label><span className="field-label">Nombre</span><input className="field mt-2" onChange={(event) => setName(event.target.value)} required value={name} /></label>
            <label><span className="field-label">Capacidad</span><input className="field mt-2" min="1" onChange={(event) => setCapacity(event.target.value)} placeholder="Opcional" type="number" value={capacity} /></label>
            <div className="grid gap-4 md:grid-cols-2">
              <label><span className="field-label">Hora apertura</span><input className="field mt-2" onChange={(event) => setOpeningTime(event.target.value)} required type="time" value={openingTime} /></label>
              <label><span className="field-label">Hora cierre</span><input className="field mt-2" onChange={(event) => setClosingTime(event.target.value)} required type="time" value={closingTime} /></label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label><span className="field-label">Max. mensual</span><input className="field mt-2" min="1" onChange={(event) => setMonthlyLimit(event.target.value)} required type="number" value={monthlyLimit} /></label>
              <label><span className="field-label">Anticipacion minima</span><input className="field mt-2" min="0" onChange={(event) => setMinNoticeHours(event.target.value)} required type="number" value={minNoticeHours} /></label>
              <label><span className="field-label">Duracion maxima</span><input className="field mt-2" min="1" onChange={(event) => setMaxDurationHours(event.target.value)} required step="0.5" type="number" value={maxDurationHours} /></label>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-700"><input checked={requiresManualApproval} className="size-4" onChange={(event) => setRequiresManualApproval(event.target.checked)} type="checkbox" /><span>Requiere aprobacion manual antes de confirmar la reserva</span></label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-700"><input checked={requiresRules} className="size-4" onChange={(event) => setRequiresRules(event.target.checked)} type="checkbox" /><span>Requiere aceptacion de reglamento para reservar</span></label>
            <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Guardando..." : selectedAmenityId ? "Guardar cambios" : "Crear amenity"}</button>
          </form>
        </div>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Configuracion vigente</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando amenities.</p> : amenities.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay amenities configurados.</p> : amenities.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.nombre}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{item.hora_apertura.slice(0, 5)} a {item.hora_cierre.slice(0, 5)} · Cap. {item.capacidad ?? "-"}</p></div><span className={item.activo ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>{item.activo ? "activo" : "inactivo"}</span></div><div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{item.max_reservas_mensuales} por mes</span><span>{item.anticipacion_min_horas} h de anticipo</span><span>{item.duracion_max_horas} h max.</span><span>{item.requiere_aprobacion_manual ? "aprobacion manual" : "confirmacion automatica"}</span></div><div className="mt-4 flex flex-wrap items-center gap-3"><span className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.requiere_aceptacion_reglamento ? "con reglamento" : "sin reglamento"}</span><button className="button-secondary" onClick={() => handleAmenitySelection(item.id)} type="button">Editar</button><button className="button-secondary" disabled={togglingId === item.id} onClick={() => handleToggleAmenity(item)} type="button">{togglingId === item.id ? "Actualizando..." : item.activo ? "Desactivar" : "Reactivar"}</button></div></div>)}
          </div>
        </article>
      </div>
    </section>
  );
}