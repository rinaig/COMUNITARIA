"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/domain";
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
};
type Reservation = { id: string; fecha: string; hora_inicio: string; hora_fin: string; estado: string; amenity_id?: string; amenities?: { nombre: string } | null };

type ReservationsLivePanelProps = {
  role: AppRole;
};

const DAYS_IN_WEEK = 7;
const MONTH_GRID_CELLS = 42;

type CalendarMode = "week" | "month";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfCalendarMonth(date: Date) {
  const monthStart = startOfMonth(date);
  const dayOfWeek = (monthStart.getDay() + 6) % 7;
  return addDays(monthStart, -dayOfWeek);
}

function formatWeekLabel(days: Date[]) {
  if (days.length === 0) {
    return "";
  }

  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth();
  const firstMonth = first.toLocaleDateString("es-AR", { month: "long" });
  const lastMonth = last.toLocaleDateString("es-AR", { month: "long" });
  return sameMonth
    ? `${first.getDate()} al ${last.getDate()} de ${firstMonth}`
    : `${first.getDate()} de ${firstMonth} al ${last.getDate()} de ${lastMonth}`;
}

function normalizeStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function getStatusClassName(status: string) {
  if (["confirmada", "aprobada", "activa"].includes(status)) {
    return "status-badge status-badge--success";
  }
  if (["pendiente", "en_revision"].includes(status)) {
    return "status-badge status-badge--warning";
  }
  return "status-badge status-badge--neutral";
}

export function ReservationsLivePanel({ role }: ReservationsLivePanelProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [processingReservationId, setProcessingReservationId] = useState("");
  const [editingReservationId, setEditingReservationId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [amenityId, setAmenityId] = useState("");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodAnchor, setPeriodAnchor] = useState(() => startOfDay(new Date()));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("");

  const periodRange = useMemo(() => {
    if (calendarMode === "month") {
      return {
        start: startOfMonth(periodAnchor),
        end: endOfMonth(periodAnchor),
      };
    }

    return {
      start: periodAnchor,
      end: addDays(periodAnchor, DAYS_IN_WEEK - 1),
    };
  }, [calendarMode, periodAnchor]);

  const loadReservations = useCallback(async (userId?: string) => {
    if (!supabase) {
      return;
    }
    setLoading(true);
    setError("");
    const rangeStart = formatDateInput(periodRange.start);
    const rangeEnd = formatDateInput(periodRange.end);
    const amenitiesQuery = supabase.from("amenities").select("id, nombre, capacidad, hora_apertura, hora_cierre, max_reservas_mensuales, anticipacion_min_horas, duracion_max_horas, requiere_aprobacion_manual").eq("activo", true).order("nombre", { ascending: true });
    const reservationsQuery = role === "admin"
      ? supabase.from("reservas").select("id, fecha, hora_inicio, hora_fin, estado, amenity_id, amenities(nombre)").gte("fecha", rangeStart).lte("fecha", rangeEnd).order("fecha", { ascending: true }).order("hora_inicio", { ascending: true }).limit(120)
      : supabase.from("reservas").select("id, fecha, hora_inicio, hora_fin, estado, amenity_id, amenities(nombre)").eq("usuario_id", userId ?? "").gte("fecha", rangeStart).lte("fecha", rangeEnd).order("fecha", { ascending: true }).order("hora_inicio", { ascending: true }).limit(120);
    const [amenitiesResult, reservationsResult] = await Promise.all([amenitiesQuery, reservationsQuery]);
    const firstError = [amenitiesResult.error, reservationsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    const nextAmenities = (amenitiesResult.data as Amenity[] | null) ?? [];
    setAmenities(nextAmenities);
    if (!amenityId && nextAmenities[0]) {
      setAmenityId(nextAmenities[0].id);
    }
    setReservations((reservationsResult.data as Reservation[] | null) ?? []);
    setLoading(false);
  }, [amenityId, periodRange.end, periodRange.start, role, supabase]);

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
        await loadReservations(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadReservations, supabase]);

  const weekDays = useMemo(() => Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(periodRange.start, index)), [periodRange.start]);

  const monthDays = useMemo(() => {
    const monthGridStart = startOfCalendarMonth(periodAnchor);
    return Array.from({ length: MONTH_GRID_CELLS }, (_, index) => addDays(monthGridStart, index));
  }, [periodAnchor]);

  const selectedAmenity = useMemo(
    () => amenities.find((item) => item.id === amenityId) ?? amenities[0] ?? null,
    [amenities, amenityId],
  );

  const calendarReservations = useMemo(() => {
    const amenityFilter = role === "residente" ? amenityId : selectedAmenity?.id;
    return reservations.filter((item) => !amenityFilter || item.amenity_id === amenityFilter);
  }, [amenityId, reservations, role, selectedAmenity]);

  const reservationsByDate = useMemo(() => {
    const sourceDays = calendarMode === "month" ? monthDays : weekDays;
    return sourceDays.reduce<Record<string, Reservation[]>>((acc, day) => {
      const key = formatDateInput(day);
      acc[key] = calendarReservations.filter((item) => item.fecha === key);
      return acc;
    }, {});
  }, [calendarMode, calendarReservations, monthDays, weekDays]);

  const upcomingReservations = useMemo(() => reservations.slice(0, 8), [reservations]);

  const weekSummary = useMemo(() => {
    const totalReservations = calendarReservations.length;
    const sourceDays = calendarMode === "month" ? monthDays : weekDays;
    const occupiedDays = sourceDays.filter((day) => (reservationsByDate[formatDateInput(day)] ?? []).length > 0).length;
    return { totalReservations, occupiedDays };
  }, [calendarMode, calendarReservations.length, monthDays, reservationsByDate, weekDays]);

  function shiftPeriod(direction: -1 | 1) {
    setPeriodAnchor((current) => {
      const next = calendarMode === "month" ? addMonths(current, direction) : addDays(current, direction * DAYS_IN_WEEK);
      return next < today && calendarMode === "week" ? today : next;
    });
  }

  function beginReschedule(reservation: Reservation) {
    setEditingReservationId(reservation.id);
    setRescheduleDate(reservation.fecha);
    setRescheduleStartTime(reservation.hora_inicio.slice(0, 5));
    setRescheduleEndTime(reservation.hora_fin.slice(0, 5));
    setError("");
    setMessage("");
  }

  function cancelReschedule() {
    setEditingReservationId("");
    setRescheduleDate("");
    setRescheduleStartTime("");
    setRescheduleEndTime("");
  }

  async function handleCreateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || role !== "residente") {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { error: createError } = await supabase.rpc("create_reservation_request", {
      p_amenity_id: amenityId,
      p_fecha: date,
      p_hora_inicio: startTime,
      p_hora_fin: endTime,
    });
    if (createError) {
      setError(createError.message);
      setSaving(false);
      return;
    }
    setMessage("Reserva confirmada correctamente.");
    await loadReservations(session?.user.id);
    setSaving(false);
  }

  async function handleCancelReservation(reservationId: string) {
    if (!supabase || !session?.user) {
      return;
    }

    setProcessingReservationId(reservationId);
    setError("");
    setMessage("");

    const { error: cancelError } = await supabase.rpc("cancel_reservation_request", {
      p_reservation_id: reservationId,
      p_reason: null,
    });

    if (cancelError) {
      setError(cancelError.message);
      setProcessingReservationId("");
      return;
    }

    if (editingReservationId === reservationId) {
      cancelReschedule();
    }

    setMessage("Reserva cancelada correctamente.");
    await loadReservations(session.user.id);
    setProcessingReservationId("");
  }

  async function handleRescheduleReservation(event: FormEvent<HTMLFormElement>, reservationId: string) {
    event.preventDefault();
    if (!supabase || !session?.user) {
      return;
    }

    setProcessingReservationId(reservationId);
    setError("");
    setMessage("");

    const { error: rescheduleError } = await supabase.rpc("reschedule_reservation_request", {
      p_reservation_id: reservationId,
      p_fecha: rescheduleDate,
      p_hora_inicio: rescheduleStartTime,
      p_hora_fin: rescheduleEndTime,
    });

    if (rescheduleError) {
      setError(rescheduleError.message);
      setProcessingReservationId("");
      return;
    }

    cancelReschedule();
    setMessage("Reserva reprogramada correctamente.");
    await loadReservations(session.user.id);
    setProcessingReservationId("");
  }

  async function handleReviewReservation(reservationId: string, nextStatus: "confirmada" | "cancelada") {
    if (!supabase || !session?.user) {
      return;
    }

    setProcessingReservationId(reservationId);
    setError("");
    setMessage("");

    const { error: reviewError } = await supabase.rpc("review_reservation_request", {
      p_reservation_id: reservationId,
      p_estado: nextStatus,
    });

    if (reviewError) {
      setError(reviewError.message);
      setProcessingReservationId("");
      return;
    }

    setMessage(nextStatus === "confirmada" ? "Reserva aprobada correctamente." : "Reserva rechazada correctamente.");
    await loadReservations(session.user.id);
    setProcessingReservationId("");
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Reservas reales</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{role === "admin" ? "Agenda operativa de amenities" : "Reservar amenities en tiempo real"}</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">{role === "admin" ? "Vista consolidada de reservas futuras del consorcio." : "La reserva se valida contra solapamientos, horario operativo, anticipacion minima y limite mensual del amenity."}</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {role === "residente" ? (
          <form className="role-card grid gap-4" onSubmit={handleCreateReservation}>
            <label><span className="field-label">Espacio</span><select className="field-select mt-2" onChange={(event) => setAmenityId(event.target.value)} value={amenityId}>{amenities.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label><span className="field-label">Fecha</span><input className="field mt-2" onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></label>
            <label><span className="field-label">Hora inicio</span><input className="field mt-2" onChange={(event) => setStartTime(event.target.value)} required type="time" value={startTime} /></label>
            <label><span className="field-label">Hora fin</span><input className="field mt-2" onChange={(event) => setEndTime(event.target.value)} required type="time" value={endTime} /></label>
            {selectedAmenity ? <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm leading-7 text-slate-600"><p className="text-sm font-semibold text-slate-900">Reglas activas para {selectedAmenity.nombre}</p><p className="mt-2">Horario {selectedAmenity.hora_apertura.slice(0, 5)} a {selectedAmenity.hora_cierre.slice(0, 5)} · hasta {selectedAmenity.duracion_max_horas} h por reserva</p><p className="mt-1">Maximo {selectedAmenity.max_reservas_mensuales} reservas por mes · anticipo minimo {selectedAmenity.anticipacion_min_horas} h</p><p className="mt-1">{selectedAmenity.requiere_aprobacion_manual ? "Este espacio requiere aprobacion manual antes de confirmarse." : "Este espacio confirma automaticamente si cumple las reglas."}</p></div> : null}
            <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Reservando..." : "Confirmar reserva"}</button>
          </form>
        ) : (
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Espacios activos</p>
            <div className="mt-4 grid gap-3">
              {amenities.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay amenities activos.</p> : amenities.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.nombre}</h4><span className="status-badge status-badge--neutral">Cap. {item.capacidad ?? "-"}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{item.hora_apertura.slice(0, 5)} a {item.hora_cierre.slice(0, 5)}</p><div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{item.max_reservas_mensuales} por mes</span><span>{item.anticipacion_min_horas} h anticipo</span><span>{item.duracion_max_horas} h max.</span><span>{item.requiere_aprobacion_manual ? "requiere aprobacion" : "auto"}</span></div></div>)}
            </div>
          </article>
        )}

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Reservas futuras</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando reservas.</p> : upcomingReservations.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay reservas futuras registradas.</p> : upcomingReservations.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.amenities?.nombre ?? "Amenity"}</h4><span className={getStatusClassName(item.estado)}>{normalizeStatusLabel(item.estado)}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">{new Date(item.fecha).toLocaleDateString("es-AR")} · {item.hora_inicio.slice(0, 5)} a {item.hora_fin.slice(0, 5)}</p>{role === "admin" && item.estado === "pendiente" ? <div className="mt-4 flex flex-wrap gap-3"><button className="button-primary" disabled={processingReservationId === item.id} onClick={() => handleReviewReservation(item.id, "confirmada")} type="button">{processingReservationId === item.id ? "Procesando..." : "Aprobar"}</button><button className="button-secondary" disabled={processingReservationId === item.id} onClick={() => handleReviewReservation(item.id, "cancelada")} type="button">{processingReservationId === item.id ? "Procesando..." : "Rechazar"}</button></div> : null}{role !== "admin" && item.estado !== "cancelada" ? <div className="mt-4 flex flex-wrap gap-3"><button className="button-secondary" disabled={processingReservationId === item.id} onClick={() => beginReschedule(item)} type="button">Reprogramar</button><button className="button-secondary" disabled={processingReservationId === item.id} onClick={() => handleCancelReservation(item.id)} type="button">{processingReservationId === item.id ? "Procesando..." : "Cancelar"}</button></div> : null}{editingReservationId === item.id ? <form className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4" onSubmit={(event) => handleRescheduleReservation(event, item.id)}><div className="grid gap-3 md:grid-cols-3"><label><span className="field-label">Fecha</span><input className="field mt-2" onChange={(event) => setRescheduleDate(event.target.value)} required type="date" value={rescheduleDate} /></label><label><span className="field-label">Inicio</span><input className="field mt-2" onChange={(event) => setRescheduleStartTime(event.target.value)} required type="time" value={rescheduleStartTime} /></label><label><span className="field-label">Fin</span><input className="field mt-2" onChange={(event) => setRescheduleEndTime(event.target.value)} required type="time" value={rescheduleEndTime} /></label></div><div className="flex flex-wrap gap-3"><button className="button-primary" disabled={processingReservationId === item.id} type="submit">{processingReservationId === item.id ? "Guardando..." : "Guardar cambio"}</button><button className="button-secondary" onClick={cancelReschedule} type="button">Cerrar</button></div></form> : null}</div>)}
          </div>
        </article>
      </div>

      <article className="role-card mt-6 overflow-hidden">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Agenda {calendarMode === "month" ? "mensual" : "semanal"}</p>
            <h4 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{selectedAmenity?.nombre ?? "Agenda de amenities"}</h4>
            <p className="mt-2 text-sm leading-7 text-slate-600">{calendarMode === "month" ? periodAnchor.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : formatWeekLabel(weekDays)} · {weekSummary.totalReservations} reservas visibles · {weekSummary.occupiedDays} dias ocupados</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex gap-3">
              <button className={calendarMode === "week" ? "button-primary" : "button-secondary"} onClick={() => setCalendarMode("week")} type="button">Semana</button>
              <button className={calendarMode === "month" ? "button-primary" : "button-secondary"} onClick={() => setCalendarMode("month")} type="button">Mes</button>
            </div>
            <label className="min-w-64"><span className="field-label">Amenity visible</span><select className="field-select mt-2" onChange={(event) => setAmenityId(event.target.value)} value={amenityId}>{amenities.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <div className="flex gap-3">
              <button className="button-secondary" disabled={calendarMode === "week" && periodAnchor <= today} onClick={() => shiftPeriod(-1)} type="button">{calendarMode === "month" ? "Mes anterior" : "Semana anterior"}</button>
              <button className="button-secondary" onClick={() => shiftPeriod(1)} type="button">{calendarMode === "month" ? "Mes siguiente" : "Semana siguiente"}</button>
            </div>
          </div>
        </div>

        <div className={calendarMode === "month" ? "mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7" : "mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7"}>
          {(calendarMode === "month" ? monthDays : weekDays).map((day) => {
            const key = formatDateInput(day);
            const dayReservations = reservationsByDate[key] ?? [];
            const isToday = key === formatDateInput(today);
            const isOutsideCurrentMonth = calendarMode === "month" && day.getMonth() !== periodAnchor.getMonth();
            return (
              <div className={isOutsideCurrentMonth ? "rounded-[1.75rem] border border-slate-200 bg-slate-100/70 p-4 opacity-65" : "rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-4"} key={key}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{day.toLocaleDateString("es-AR", { weekday: "short" })}</p>
                    <h5 className="mt-1 text-xl font-semibold text-slate-950">{day.getDate()}</h5>
                  </div>
                  {isToday ? <span className="status-badge status-badge--success">Hoy</span> : null}
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">{day.toLocaleDateString("es-AR", { month: "short" })}</p>
                <div className="mt-4 grid gap-3">
                  {dayReservations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-3 py-4 text-sm leading-6 text-slate-500">Sin reservas para este dia.</div>
                  ) : (
                    dayReservations.map((item) => (
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]" key={item.id}>
                        <div className="flex items-start justify-between gap-2">
                          <strong className="text-sm text-slate-950">{item.hora_inicio.slice(0, 5)} - {item.hora_fin.slice(0, 5)}</strong>
                          <span className={getStatusClassName(item.estado)}>{normalizeStatusLabel(item.estado)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.amenities?.nombre ?? selectedAmenity?.nombre ?? "Amenity"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}