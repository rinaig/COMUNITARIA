"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRecord, TenantRecord } from "@/lib/auth-types";
import type { AppRole } from "@/lib/domain";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PortalAccessGuardProps = {
  requiredRole: AppRole;
  children: React.ReactNode;
};

const roleLabel: Record<AppRole, string> = {
  superadmin: "SuperUser",
  admin: "Administrador",
  residente: "Usuario",
  seguridad: "Seguridad",
};

const roleRoute: Record<AppRole, string> = {
  superadmin: "/portal/plataforma",
  admin: "/portal/admin",
  residente: "/portal/residente",
  seguridad: "/portal/seguridad",
};

export function PortalAccessGuard({ requiredRole, children }: PortalAccessGuardProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(() => configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [error, setError] = useState("");

  const refreshProfile = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, nombre, apellido, telefono, dni, unidad_funcional, rol, estado, consorcio_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      return;
    }

    const nextProfile = (data as ProfileRecord | null) ?? null;
    setProfile(nextProfile);

    if (!nextProfile?.consorcio_id) {
      setTenant(null);
      return;
    }

    const { data: tenantData, error: tenantError } = await supabase
      .from("consorcios")
      .select("id, nombre, direccion, codigo_invitacion, tipo, tipo_otro, trial_unit_limit, trial_guard_post_limit, contacto_email, contacto_telefono")
      .eq("id", nextProfile.consorcio_id)
      .maybeSingle();

    if (tenantError) {
      setError(tenantError.message);
      return;
    }

    setTenant((tenantData as TenantRecord | null) ?? null);
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
      }

      setSession(data.session ?? null);

      if (data.session?.user) {
        await refreshProfile(data.session.user.id);
      }

      setLoading(false);
    };

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setError("");

      if (!nextSession?.user) {
        setProfile(null);
        setTenant(null);
        setLoading(false);
        return;
      }

      void refreshProfile(nextSession.user.id);
      setLoading(false);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [refreshProfile, supabase]);

  if (!configured) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="glass-panel rounded-[2rem] p-8">
        <p className="text-sm font-semibold text-slate-500">Verificando acceso</p>
        <p className="mt-3 text-base leading-7 text-slate-700">
          Cargando sesion y permisos del portal.
        </p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="glass-panel rounded-[2rem] p-8">
        <p className="text-sm font-semibold text-slate-500">Sesion requerida</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">
          Ingresa para abrir este portal.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">
          Este modulo exige autenticacion real. Ingresa desde la pantalla de acceso y completa el alta correspondiente.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="button-primary" href="/auth">
            Ir a acceso
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel rounded-[2rem] p-8">
        <p className="text-sm font-semibold text-amber-700">Error de permisos</p>
        <p className="mt-3 text-base leading-7 text-amber-700">{error}</p>
      </div>
    );
  }

  if (profile?.rol === "superadmin" && requiredRole === "superadmin") {
    return <>{children}</>;
  }

  if (!profile?.consorcio_id) {
    return (
      <div className="glass-panel rounded-[2rem] p-8">
        <p className="text-sm font-semibold text-slate-500">Alta incompleta</p>
        <p className="mt-3 text-base leading-7 text-slate-700">
          Tu cuenta existe, pero todavia no esta vinculada a un consorcio. Completa el alta desde la pantalla de acceso.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="button-primary" href="/auth">
            Completar alta
          </Link>
        </div>
      </div>
    );
  }

  if (profile.estado !== "activo") {
    return (
      <div className="glass-panel rounded-[2rem] p-8">
        <p className="text-sm font-semibold text-slate-500">Acceso pendiente</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">
          Tu solicitud todavia no fue aprobada.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">
          El administrador del consorcio {tenant?.nombre ?? "seleccionado"} debe revisar tu alta antes de habilitar el portal.
        </p>
        {requiredRole === "admin" && tenant?.trial_unit_limit ? <p className="mt-3 text-sm leading-7 text-emerald-700">Durante la prueba inicial puedes operar hasta {tenant.trial_unit_limit} unidades y {tenant.trial_guard_post_limit} puesto de vigilancia.</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="button-secondary" href="/auth">
            Ver estado de la cuenta
          </Link>
        </div>
      </div>
    );
  }

  const roleAllowed = profile.rol === requiredRole || profile.rol === "superadmin";

  if (!roleAllowed) {
    return (
      <div className="glass-panel rounded-[2rem] p-8">
        <p className="text-sm font-semibold text-slate-500">Rol insuficiente</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">
          Este portal es para {roleLabel[requiredRole]}.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">
          Tu cuenta activa pertenece al rol {roleLabel[profile.rol]}. Usa el acceso correspondiente a tu perfil.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="button-primary" href={roleRoute[profile.rol]}>
            Abrir mi portal
          </Link>
          <Link className="button-secondary" href="/auth">
            Ver mi cuenta
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}