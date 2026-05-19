"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/domain";
import type { ProfileRecord, TenantRecord } from "@/lib/auth-types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type AuthView = "login" | "admin" | "access";
type AccessRole = "admin" | "residente" | "seguridad";
type TenantType = "edificio" | "barrio_privado" | "country" | "otro";

const portalRouteByRole: Record<AppRole, string> = {
  superadmin: "/portal/plataforma",
  admin: "/portal/admin",
  residente: "/portal/residente",
  seguridad: "/portal/seguridad",
};

const roleLabel: Record<AppRole, string> = {
  superadmin: "SuperUser",
  admin: "Administrador",
  residente: "Usuario",
  seguridad: "Seguridad",
};

function normalizeDni(value: string) {
  return value.replace(/\D/g, "");
}

function isValidDni(value: string) {
  return /^\d{7,8}$/.test(normalizeDni(value));
}

function isStrongPassword(value: string) {
  return /[A-Z]/.test(value) && /[a-zA-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value) && value.length >= 8;
}

function resolveRoute(profile: ProfileRecord | null) {
  if (!profile || profile.estado !== "activo") {
    return null;
  }

  return portalRouteByRole[profile.rol];
}

export function AuthClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCode = searchParams.get("codigo")?.trim() ?? "";
  const prefillEmail = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const prefillUnit = searchParams.get("unidad")?.trim().toUpperCase() ?? "";
  const typeParam = searchParams.get("tipo")?.trim();
  const prefillRole: AccessRole = typeParam === "admin" ? "admin" : typeParam === "seguridad" ? "seguridad" : "residente";

  const [view, setView] = useState<AuthView>(() => (prefillCode ? "access" : "login"));
  const [accessRole, setAccessRole] = useState<AccessRole>(prefillRole);
  const [tenantType, setTenantType] = useState<TenantType>("edificio");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [unidad, setUnidad] = useState(prefillUnit);
  const [codigoAcceso, setCodigoAcceso] = useState(prefillCode);
  const [consorcioNombre, setConsorcioNombre] = useState("");
  const [consorcioDireccion, setConsorcioDireccion] = useState("");
  const [consorcioCuit, setConsorcioCuit] = useState("");
  const [tipoOtro, setTipoOtro] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(configured && Boolean(supabase));

  const hydrateFormFromUser = useCallback((user: User) => {
    setEmail(user.email ?? "");
    setNombre((current) => current || user.user_metadata?.nombre || user.user_metadata?.full_name?.split(" ")[0] || "");
    setApellido((current) => current || user.user_metadata?.apellido || "");
    setTelefono((current) => current || user.user_metadata?.telefono || "");
    setDni((current) => current || user.user_metadata?.dni || "");
  }, []);

  const refreshProfile = useCallback(async (userId: string) => {
    if (!supabase) {
      return null;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, nombre, apellido, telefono, dni, unidad_funcional, es_menor, adulto_responsable_id, adulto_responsable_email, rol, estado, consorcio_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      return null;
    }

    const nextProfile = (profileData as ProfileRecord | null) ?? null;
    setProfile(nextProfile);

    if (!nextProfile?.consorcio_id) {
      setTenant(null);
      return nextProfile;
    }

    const { data: tenantData, error: tenantError } = await supabase
      .from("consorcios")
      .select("id, nombre, direccion, codigo_invitacion, tipo, tipo_otro, trial_unit_limit, trial_guard_post_limit, contacto_email, contacto_telefono")
      .eq("id", nextProfile.consorcio_id)
      .maybeSingle();

    if (tenantError) {
      setError(tenantError.message);
      return nextProfile;
    }

    setTenant((tenantData as TenantRecord | null) ?? null);
    return nextProfile;
  }, [supabase]);

  const navigateIfReady = useCallback((nextProfile: ProfileRecord | null) => {
    const route = resolveRoute(nextProfile);
    if (route) {
      router.push(route);
    }
  }, [router]);

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
        hydrateFormFromUser(data.session.user);
        const nextProfile = await refreshProfile(data.session.user.id);
        navigateIfReady(nextProfile);
      }

      setLoadingSession(false);
    };

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setError("");
      setMessage("");

      if (!nextSession?.user) {
        setProfile(null);
        setTenant(null);
        setLoadingSession(false);
        return;
      }

      hydrateFormFromUser(nextSession.user);
      void refreshProfile(nextSession.user.id).then((nextProfile) => {
        navigateIfReady(nextProfile);
      });
      setLoadingSession(false);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [hydrateFormFromUser, navigateIfReady, refreshProfile, supabase]);

  const ensureRegistrationData = useCallback(() => {
    if (!nombre.trim() || !apellido.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return false;
    }

    if (!isValidDni(dni)) {
      setError("El DNI debe tener 7 u 8 digitos.");
      return false;
    }

    if (!session?.user && !isStrongPassword(password)) {
      setError("La contrasena debe tener al menos 8 caracteres, una mayuscula, un numero y un caracter especial.");
      return false;
    }

    return true;
  }, [apellido, dni, nombre, password, session?.user]);

  async function ensureAuthenticatedUser() {
    if (!supabase) {
      return null;
    }

    if (session?.user) {
      return session.user;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre,
          apellido,
          telefono,
          dni: normalizeDni(dni),
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return null;
    }

    if (!data.session || !data.user) {
      setMessage("La cuenta fue creada. Confirma el correo si tu proyecto lo requiere y luego inicia sesion para completar el alta.");
      return null;
    }

    return data.user;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }

    setMessage("Sesion iniciada correctamente.");
    setBusy(false);
  }

  async function handleAdminRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    if (!ensureRegistrationData()) {
      setBusy(false);
      return;
    }

    if (!consorcioNombre.trim() || !consorcioDireccion.trim()) {
      setError("Nombre y direccion del consorcio son obligatorios.");
      setBusy(false);
      return;
    }

    if (tenantType === "otro" && !tipoOtro.trim()) {
      setError("Debes indicar el tipo cuando eliges Otros.");
      setBusy(false);
      return;
    }

    const user = await ensureAuthenticatedUser();

    if (!user) {
      setBusy(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("complete_admin_registration", {
      p_nombre: nombre.trim(),
      p_apellido: apellido.trim(),
      p_telefono: telefono.trim(),
      p_dni: normalizeDni(dni),
      p_consorcio_nombre: consorcioNombre.trim(),
      p_consorcio_direccion: consorcioDireccion.trim(),
      p_cuit: consorcioCuit.trim() || null,
      p_tipo: tenantType,
      p_tipo_otro: tenantType === "otro" ? tipoOtro.trim() : null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    const result = Array.isArray(data) ? data[0] : null;
    setMessage(
      result?.codigo_invitacion
        ? `Alta completada. Codigo principal del consorcio: ${result.codigo_invitacion}. Tenes 30 dias de prueba.`
        : "Alta completada. Ya podes operar con tu prueba inicial.",
    );

    const nextProfile = await refreshProfile(user.id);
    navigateIfReady(nextProfile);
    setBusy(false);
  }

  async function handleAccessActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    if (!codigoAcceso.trim()) {
      setError("El codigo de acceso es obligatorio.");
      setBusy(false);
      return;
    }

    if (!ensureRegistrationData()) {
      setBusy(false);
      return;
    }

    if (accessRole === "residente" && !unidad.trim()) {
      setError("La unidad funcional es obligatoria para residentes.");
      setBusy(false);
      return;
    }

    const user = await ensureAuthenticatedUser();

    if (!user) {
      setBusy(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("activate_access_with_code", {
      p_codigo: codigoAcceso.trim(),
      p_rol_esperado: accessRole,
      p_nombre: nombre.trim(),
      p_apellido: apellido.trim(),
      p_telefono: telefono.trim() || null,
      p_dni: normalizeDni(dni),
      p_unidad_funcional: accessRole === "residente" ? unidad.trim().toUpperCase() : null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    setMessage("Acceso activado correctamente.");
    const nextProfile = await refreshProfile(user.id);
    navigateIfReady(nextProfile);
    setBusy(false);
  }

  async function handleLogout() {
    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    await supabase.auth.signOut();
    setBusy(false);
  }

  const profileReady = Boolean(
    profile && profile.estado === "activo" && (profile.rol === "superadmin" || (profile.consorcio_id && profile.nombre && profile.apellido)),
  );
  const sessionNeedsSetup = Boolean(session?.user) && !profileReady;
  const activeRoute = resolveRoute(profile);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[radial-gradient(circle_at_top_right,_rgba(30,58,138,0.18),_transparent_28%),linear-gradient(180deg,_#eff6ff_0%,_#f3f4f6_48%,_#ffffff_100%)] px-6 py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="glass-panel rounded-[2rem] p-8 lg:p-10">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Acceso productivo
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
            Ingreso simple para administradores, usuarios y seguridad.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
            El administrador crea su consorcio y recibe prueba real por 30 dias. Los demas perfiles entran con codigo unico emitido por la administracion.
          </p>

          <div className="mt-8 grid gap-4">
            <article className="role-card">
              <p className="text-sm font-semibold text-slate-500">Como funciona</p>
              <ul className="mt-3 grid gap-3 text-sm leading-7 text-slate-700">
                <li>Administrador: alta directa del consorcio con prueba inicial y limites operativos.</li>
                <li>Usuario o seguridad: activacion con mail y codigo valido por 48 horas.</li>
                <li>Los errores de rol se informan en el alta para evitar accesos al flujo equivocado.</li>
              </ul>
            </article>

            <article className="role-card">
              <p className="text-sm font-semibold text-slate-500">Estado de configuracion</p>
              <div className="mt-3 flex items-center gap-3">
                <span className={`status-badge ${configured ? "status-badge--success" : "status-badge--warning"}`}>
                  {configured ? "Supabase listo" : "Faltan variables"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Cargar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local para usar el acceso real.
              </p>
              {codigoAcceso ? (
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  Codigo detectado: {codigoAcceso}. El formulario de activacion ya quedo preparado.
                </p>
              ) : null}
            </article>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link className="button-secondary" href="/">
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-8 lg:p-10">
          {loadingSession ? (
            <div className="role-card">
              <p className="text-sm font-semibold text-slate-500">Verificando sesion</p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Cargando autenticacion y perfil actual.
              </p>
            </div>
          ) : !configured ? (
            <div className="role-card">
              <p className="text-sm font-semibold text-slate-500">Configuracion pendiente</p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                La interfaz ya esta preparada, pero necesita variables reales de Supabase para operar.
              </p>
            </div>
          ) : session?.user ? (
            <div className="grid gap-5">
              <article className="role-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Sesion activa</p>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                      {profile?.nombre || nombre || "Usuario"} {profile?.apellido || apellido || ""}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{session.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`status-badge ${profile?.estado === "activo" ? "status-badge--success" : "status-badge--warning"}`}>
                      {profile?.estado ?? "sin perfil"}
                    </span>
                    <button className="button-secondary" onClick={() => void handleLogout()} type="button">
                      Cerrar sesion
                    </button>
                  </div>
                </div>
              </article>

              {sessionNeedsSetup ? (
                <>
                  <div className="flex flex-wrap gap-3">
                    <button className={view === "admin" ? "button-primary" : "button-secondary"} onClick={() => setView("admin")} type="button">
                      Alta de administrador
                    </button>
                    <button className={view === "access" ? "button-primary" : "button-secondary"} onClick={() => setView("access")} type="button">
                      Activar con codigo
                    </button>
                  </div>

                  {view === "admin" ? (
                    <form className="grid gap-4" onSubmit={handleAdminRegistration}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          <span className="field-label">Nombre</span>
                          <input className="field mt-2" onChange={(event) => setNombre(event.target.value)} required value={nombre} />
                        </label>
                        <label>
                          <span className="field-label">Apellido</span>
                          <input className="field mt-2" onChange={(event) => setApellido(event.target.value)} required value={apellido} />
                        </label>
                        <label>
                          <span className="field-label">Telefono</span>
                          <input className="field mt-2" onChange={(event) => setTelefono(event.target.value)} value={telefono} />
                        </label>
                        <label>
                          <span className="field-label">DNI</span>
                          <input className="field mt-2" onChange={(event) => setDni(normalizeDni(event.target.value))} required value={dni} />
                        </label>
                        <label>
                          <span className="field-label">Nombre del consorcio</span>
                          <input className="field mt-2" onChange={(event) => setConsorcioNombre(event.target.value)} required value={consorcioNombre} />
                        </label>
                        <label>
                          <span className="field-label">Direccion</span>
                          <input className="field mt-2" onChange={(event) => setConsorcioDireccion(event.target.value)} required value={consorcioDireccion} />
                        </label>
                        <label>
                          <span className="field-label">Tipo</span>
                          <select className="field mt-2" onChange={(event) => setTenantType(event.target.value as TenantType)} value={tenantType}>
                            <option value="edificio">Edificio</option>
                            <option value="barrio_privado">Barrio privado</option>
                            <option value="country">Country</option>
                            <option value="otro">Otro</option>
                          </select>
                        </label>
                        <label>
                          <span className="field-label">CUIT</span>
                          <input className="field mt-2" onChange={(event) => setConsorcioCuit(event.target.value)} value={consorcioCuit} />
                        </label>
                        {tenantType === "otro" ? (
                          <label className="md:col-span-2">
                            <span className="field-label">Tipo personalizado</span>
                            <input className="field mt-2" onChange={(event) => setTipoOtro(event.target.value)} required value={tipoOtro} />
                          </label>
                        ) : null}
                      </div>

                      <button className="button-primary" disabled={busy} type="submit">
                        {busy ? "Guardando..." : "Completar alta administrativa"}
                      </button>
                    </form>
                  ) : (
                    <form className="grid gap-4" onSubmit={handleAccessActivation}>
                      <div className="flex flex-wrap gap-3">
                        {(["admin", "residente", "seguridad"] as AccessRole[]).map((role) => (
                          <button className={accessRole === role ? "button-primary" : "button-secondary"} key={role} onClick={() => setAccessRole(role)} type="button">
                            {roleLabel[role]}
                          </button>
                        ))}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          <span className="field-label">Codigo de acceso</span>
                          <input className="field mt-2 uppercase" onChange={(event) => setCodigoAcceso(event.target.value.toUpperCase())} required value={codigoAcceso} />
                        </label>
                        <label>
                          <span className="field-label">Unidad funcional</span>
                          <input className="field mt-2 uppercase" disabled={accessRole !== "residente"} onChange={(event) => setUnidad(event.target.value.toUpperCase())} required={accessRole === "residente"} value={unidad} />
                        </label>
                      </div>

                      <button className="button-primary" disabled={busy} type="submit">
                        {busy ? "Activando..." : "Activar acceso"}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <article className="role-card">
                  <p className="text-sm font-semibold text-slate-500">Perfil vinculado</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Rol</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {profile ? roleLabel[profile.rol] : "Sin definir"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Consorcio</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {tenant?.nombre ?? (profile?.rol === "superadmin" ? "Plataforma" : "Pendiente")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Direccion</p>
                      <p className="mt-2 text-base text-slate-700">
                        {tenant?.direccion ?? (profile?.rol === "superadmin" ? "Acceso interno oculto" : "Sin asignar")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Codigo</p>
                      <p className="mt-2 text-base font-semibold text-slate-900">
                        {tenant?.codigo_invitacion ?? "No aplica"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {activeRoute ? (
                      <Link className="button-primary" href={activeRoute}>
                        Abrir portal {profile ? roleLabel[profile.rol] : ""}
                      </Link>
                    ) : (
                      <span className="status-badge status-badge--warning">Falta completar vinculacion</span>
                    )}
                  </div>
                </article>
              )}

              {error ? (
                <article className="role-card border-amber-200 bg-amber-50/80">
                  <p className="text-sm font-semibold text-amber-700">Error</p>
                  <p className="mt-2 text-sm leading-7 text-amber-700">{error}</p>
                </article>
              ) : null}

              {message ? (
                <article className="role-card border-emerald-200 bg-emerald-50/80">
                  <p className="text-sm font-semibold text-emerald-700">Estado</p>
                  <p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p>
                </article>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="flex flex-wrap gap-3">
                <button className={view === "login" ? "button-primary" : "button-secondary"} onClick={() => setView("login")} type="button">
                  Ingresar
                </button>
                <button className={view === "admin" ? "button-primary" : "button-secondary"} onClick={() => setView("admin")} type="button">
                  Alta administrador
                </button>
                <button className={view === "access" ? "button-primary" : "button-secondary"} onClick={() => setView("access")} type="button">
                  Activar acceso
                </button>
              </div>

              {view === "login" ? (
                <form className="grid gap-4" onSubmit={handleLogin}>
                  <label>
                    <span className="field-label">Email</span>
                    <input className="field mt-2" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                  </label>
                  <label>
                    <span className="field-label">Contrasena</span>
                    <input className="field mt-2" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                  </label>

                  <button className="button-primary" disabled={busy} type="submit">
                    {busy ? "Ingresando..." : "Ingresar"}
                  </button>
                </form>
              ) : view === "admin" ? (
                <form className="grid gap-4" onSubmit={handleAdminRegistration}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="field-label">Nombre</span>
                      <input className="field mt-2" onChange={(event) => setNombre(event.target.value)} required value={nombre} />
                    </label>
                    <label>
                      <span className="field-label">Apellido</span>
                      <input className="field mt-2" onChange={(event) => setApellido(event.target.value)} required value={apellido} />
                    </label>
                    <label>
                      <span className="field-label">Telefono</span>
                      <input className="field mt-2" onChange={(event) => setTelefono(event.target.value)} value={telefono} />
                    </label>
                    <label>
                      <span className="field-label">DNI</span>
                      <input className="field mt-2" onChange={(event) => setDni(normalizeDni(event.target.value))} required value={dni} />
                    </label>
                    <label>
                      <span className="field-label">Email</span>
                      <input className="field mt-2" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                    </label>
                    <label>
                      <span className="field-label">Contrasena</span>
                      <input className="field mt-2" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                    </label>
                    <label>
                      <span className="field-label">Nombre del consorcio</span>
                      <input className="field mt-2" onChange={(event) => setConsorcioNombre(event.target.value)} required value={consorcioNombre} />
                    </label>
                    <label>
                      <span className="field-label">Direccion</span>
                      <input className="field mt-2" onChange={(event) => setConsorcioDireccion(event.target.value)} required value={consorcioDireccion} />
                    </label>
                    <label>
                      <span className="field-label">Tipo</span>
                      <select className="field mt-2" onChange={(event) => setTenantType(event.target.value as TenantType)} value={tenantType}>
                        <option value="edificio">Edificio</option>
                        <option value="barrio_privado">Barrio privado</option>
                        <option value="country">Country</option>
                        <option value="otro">Otro</option>
                      </select>
                    </label>
                    <label>
                      <span className="field-label">CUIT</span>
                      <input className="field mt-2" onChange={(event) => setConsorcioCuit(event.target.value)} value={consorcioCuit} />
                    </label>
                    {tenantType === "otro" ? (
                      <label className="md:col-span-2">
                        <span className="field-label">Tipo personalizado</span>
                        <input className="field mt-2" onChange={(event) => setTipoOtro(event.target.value)} required value={tipoOtro} />
                      </label>
                    ) : null}
                  </div>

                  <button className="button-primary" disabled={busy} type="submit">
                    {busy ? "Creando..." : "Crear cuenta y consorcio"}
                  </button>
                </form>
              ) : (
                <form className="grid gap-4" onSubmit={handleAccessActivation}>
                  <div className="flex flex-wrap gap-3">
                    {(["admin", "residente", "seguridad"] as AccessRole[]).map((role) => (
                      <button className={accessRole === role ? "button-primary" : "button-secondary"} key={role} onClick={() => setAccessRole(role)} type="button">
                        {roleLabel[role]}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="field-label">Nombre</span>
                      <input className="field mt-2" onChange={(event) => setNombre(event.target.value)} required value={nombre} />
                    </label>
                    <label>
                      <span className="field-label">Apellido</span>
                      <input className="field mt-2" onChange={(event) => setApellido(event.target.value)} required value={apellido} />
                    </label>
                    <label>
                      <span className="field-label">Telefono</span>
                      <input className="field mt-2" onChange={(event) => setTelefono(event.target.value)} value={telefono} />
                    </label>
                    <label>
                      <span className="field-label">DNI</span>
                      <input className="field mt-2" onChange={(event) => setDni(normalizeDni(event.target.value))} required value={dni} />
                    </label>
                    <label>
                      <span className="field-label">Email</span>
                      <input className="field mt-2" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                    </label>
                    <label>
                      <span className="field-label">Contrasena</span>
                      <input className="field mt-2" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                    </label>
                    <label>
                      <span className="field-label">Codigo de acceso</span>
                      <input className="field mt-2 uppercase" onChange={(event) => setCodigoAcceso(event.target.value.toUpperCase())} required value={codigoAcceso} />
                    </label>
                    <label>
                      <span className="field-label">Unidad funcional</span>
                      <input className="field mt-2 uppercase" disabled={accessRole !== "residente"} onChange={(event) => setUnidad(event.target.value.toUpperCase())} required={accessRole === "residente"} value={unidad} />
                    </label>
                  </div>

                  <button className="button-primary" disabled={busy} type="submit">
                    {busy ? "Activando..." : "Crear cuenta y activar acceso"}
                  </button>
                </form>
              )}

              {error ? (
                <article className="role-card border-amber-200 bg-amber-50/80">
                  <p className="text-sm font-semibold text-amber-700">Error</p>
                  <p className="mt-2 text-sm leading-7 text-amber-700">{error}</p>
                </article>
              ) : null}

              {message ? (
                <article className="role-card border-emerald-200 bg-emerald-50/80">
                  <p className="text-sm font-semibold text-emerald-700">Estado</p>
                  <p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p>
                </article>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}