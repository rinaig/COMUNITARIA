"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  categoria: string;
  titulo: string;
  detalle: string;
  leida_at: string | null;
  created_at: string;
};

export function PortalNotificationsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("notificaciones")
      .select("id, categoria, titulo, detalle, leida_at, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setNotifications((data as NotificationItem[] | null) ?? []);
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
        await loadNotifications();
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadNotifications, supabase]);

  const unreadCount = notifications.filter((item) => !item.leida_at).length;

  async function markAllAsRead() {
    if (!supabase) {
      return;
    }

    const unreadIds = notifications.filter((item) => !item.leida_at).map((item) => item.id);
    if (unreadIds.length === 0) {
      return;
    }

    const { error: updateError } = await supabase
      .from("notificaciones")
      .update({ leida_at: new Date().toISOString() })
      .in("id", unreadIds);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadNotifications();
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <div className="relative">
      <button className={open ? "button-primary" : "button-secondary"} onClick={() => setOpen((current) => !current)} type="button">
        Notificaciones {unreadCount > 0 ? `(${unreadCount})` : ""}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-[22rem] rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Bandeja</p>
              <h4 className="mt-2 text-xl font-semibold text-slate-950">Eventos recientes</h4>
            </div>
            <button className="button-secondary" onClick={() => void markAllAsRead()} type="button">Marcar leidas</button>
          </div>

          {error ? <p className="mt-4 text-sm leading-7 text-amber-700">{error}</p> : null}
          <div className="mt-4 grid max-h-96 gap-3 overflow-y-auto pr-1">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando notificaciones.</p> : notifications.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay eventos para mostrar.</p> : notifications.map((item) => <div className="rounded-2xl border border-slate-200 bg-slate-50/85 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h5 className="text-sm font-semibold text-slate-950">{item.titulo}</h5><span className={item.leida_at ? "status-badge status-badge--neutral" : "status-badge status-badge--warning"}>{item.leida_at ? "leida" : "nueva"}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{item.detalle}</p><p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">{item.categoria} · {new Date(item.created_at).toLocaleString("es-AR")}</p></div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}