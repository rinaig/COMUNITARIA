"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type TenantFallback = {
  code: string;
  name: string;
  address: string;
};

type TenantSummary = {
  nombre: string;
  direccion: string;
  codigo_invitacion: string;
};

type PortalTenantSummaryProps = {
  fallback: TenantFallback;
};

export function PortalTenantSummary({ fallback }: PortalTenantSummaryProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);

  const loadTenant = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("consorcio_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.consorcio_id) {
      setTenant(null);
      return;
    }

    const { data: tenantData } = await supabase
      .from("consorcios")
      .select("nombre, direccion, codigo_invitacion")
      .eq("id", profile.consorcio_id)
      .maybeSingle();

    setTenant((tenantData as TenantSummary | null) ?? null);
  }, [supabase]);

  useEffect(() => {
    if (!configured || !supabase) {
      return;
    }

    let ignore = false;

    const load = async () => {
      const { data } = await supabase.auth.getSession();

      if (ignore) {
        return;
      }

      setSession(data.session ?? null);

      if (data.session?.user) {
        await loadTenant(data.session.user.id);
      }
    };

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);

      if (!nextSession?.user) {
        setTenant(null);
        return;
      }

      void loadTenant(nextSession.user.id);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [configured, loadTenant, supabase]);

  const code = session?.user && tenant?.codigo_invitacion ? tenant.codigo_invitacion : fallback.code;
  const name = session?.user && tenant?.nombre ? tenant.nombre : fallback.name;
  const address = session?.user && tenant?.direccion ? tenant.direccion : fallback.address;

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
        Comunitaria · {code}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
        {name}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
        {address}. Arquitectura multi-tenant lista para Supabase con aislamiento por consorcio, paneles por rol y capas separadas para operaciones, finanzas y seguridad.
      </p>
    </div>
  );
}