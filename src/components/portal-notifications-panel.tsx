"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  categoria: string;
  titulo: string;
  detalle: string;
  destinatario_id: string | null;
  leida_at: string | null;
  created_at: string;
  isRead: boolean;
};

type NotificationReadRow = {
  notificacion_id: string;
  leida_at: string;
};

export function PortalNotificationsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async (profileId?: string) => {
    const currentProfileId = profileId ?? session?.user?.id;

    if (!supabase || !currentProfileId) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("notificaciones")
      .select("id, categoria, titulo, detalle, destinatario_id, leida_at, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const nextNotifications = (data as Omit<NotificationItem, "isRead">[] | null) ?? [];
    const notificationIds = nextNotifications.map((item) => item.id);

    if (notificationIds.length === 0) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const { data: readsData, error: readsError } = await supabase
      .from("notificacion_lecturas")
      .select("notificacion_id, leida_at")
      .eq("profile_id", currentProfileId)
      .in("notificacion_id", notificationIds);

    if (readsError) {
      setError(readsError.message);
      setLoading(false);
      return;
    }

    const readsByNotificationId = new Map(
      ((readsData as NotificationReadRow[] | null) ?? []).map((item) => [item.notificacion_id, item.leida_at]),
    );

    setNotifications(
      nextNotifications.map((item) => ({
        ...item,
        isRead: item.destinatario_id === currentProfileId ? Boolean(item.leida_at || readsByNotificationId.get(item.id)) : Boolean(readsByNotificationId.get(item.id)),
      })),
    );
    setLoading(false);
  }, [session?.user, supabase]);

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
        await loadNotifications(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadNotifications, supabase]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const markAllAsRead = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const unreadIds = notifications.filter((item) => !item.isRead).map((item) => item.id);
    if (unreadIds.length === 0) {
      return;
    }

    const { error: updateError } = await supabase.rpc("mark_visible_notifications_read", {
      p_notification_ids: unreadIds,
    });

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadNotifications();
  }, [loadNotifications, notifications, supabase]);

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <div className="relative z-40" ref={containerRef}>
      <button className={open ? "button-primary" : "button-secondary"} onClick={() => setOpen((current) => !current)} type="button">
        Notificaciones {unreadCount > 0 ? `(${unreadCount})` : ""}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(24rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Bandeja</p>
              <h4 className="mt-2 text-xl font-semibold text-slate-950">Eventos recientes</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="button-secondary" disabled={loading || unreadCount === 0} onClick={() => void markAllAsRead()} type="button">Marcar leidas</button>
              <button className="button-secondary" onClick={() => setOpen(false)} type="button">Cerrar</button>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm leading-7 text-amber-700">{error}</p> : null}
          <div className="mt-4 grid max-h-[min(70vh,32rem)] gap-3 overflow-y-auto pr-1">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando notificaciones.</p> : notifications.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay eventos para mostrar.</p> : notifications.map((item) => <div className="rounded-2xl border border-slate-200 bg-slate-50/85 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h5 className="text-sm font-semibold text-slate-950">{item.titulo}</h5>{item.isRead ? null : <span className="status-badge status-badge--warning">Nueva</span>}</div><p className="mt-2 text-sm leading-6 text-slate-600">{item.detalle}</p><p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">{item.categoria} · {new Date(item.created_at).toLocaleString("es-AR")}</p></div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}