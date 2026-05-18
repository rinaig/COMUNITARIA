"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { ProfileRecord, TenantRecord } from "@/lib/auth-types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type AuthMode = "login" | "register";
type AccountType = "residente" | "admin";
type AdminOnboardingMode = "crear" | "sumarme" | "demo";

const portalRouteByRole = {
  superadmin: "/portal/plataforma",
  admin: "/portal/admin",
  residente: "/portal/residente",
  seguridad: "/portal/seguridad",
} as const;

const roleLabel = {
  superadmin: "SuperAdmin",
  admin: "Administrador",
  residente: "Residente",
  seguridad: "Seguridad",
} as const;

export function AuthClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const invitePrefill = useMemo(() => {
    const inviteCode = searchParams.get("codigo")?.trim().toUpperCase() ?? "";
    const accountTypeParam = searchParams.get("tipo");
    const adminModeParam = searchParams.get("modo");

    return {
      inviteCode,
      accountType: accountTypeParam === "admin" ? "admin" : "residente",
      adminMode: adminModeParam === "sumarme" ? "sumarme" : adminModeParam === "demo" ? "demo" : "crear",
      email: searchParams.get("email")?.trim().toLowerCase() ?? "",
      unidad: searchParams.get("unidad")?.trim().toUpperCase() ?? "",
      startInRegister: inviteCode.length > 0,
    } as const;
  }, [searchParams]);
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<AuthMode>(() => invitePrefill.startInRegister ? "register" : "login");
  const [accountType, setAccountType] = useState<AccountType>(() => invitePrefill.accountType);
  const [adminOnboardingMode, setAdminOnboardingMode] = useState<AdminOnboardingMode>(() => invitePrefill.adminMode);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [inviteCode, setInviteCode] = useState(() => invitePrefill.inviteCode);
  const [email, setEmail] = useState(() => invitePrefill.email);
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [unidad, setUnidad] = useState(() => invitePrefill.unidad);
  const [consorcioNombre, setConsorcioNombre] = useState("");
  const [consorcioDireccion, setConsorcioDireccion] = useState("");
  const [cuit, setCuit] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(() => configured);

  const hydrateFormFromUser = useCallback((user: User) => {
    setEmail(user.email ?? "");
    setNombre((current) => current || user.user_metadata?.nombre || user.user_metadata?.full_name?.split(" ")[0] || "");
    setApellido((current) => current || user.user_metadata?.apellido || "");
    setTelefono((current) => current || user.user_metadata?.telefono || "");
    setDni((current) => current || user.user_metadata?.dni || "");
  }, []);

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

    setProfile((data as ProfileRecord | null) ?? null);

    if (!data?.consorcio_id) {
      setTenant(null);
      return;
    }

    const { data: tenantData, error: tenantError } = await supabase
      .from("consorcios")
      .select("id, nombre, direccion, codigo_invitacion, es_demo, demo_unit_limit")
      .eq("id", data.consorcio_id)
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
        hydrateFormFromUser(data.session.user);
        await refreshProfile(data.session.user.id);
      }

      setLoadingSession(false);
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
        setLoadingSession(false);
        return;
      }

      hydrateFormFromUser(nextSession.user);
      void refreshProfile(nextSession.user.id);
      setLoadingSession(false);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [hydrateFormFromUser, refreshProfile, supabase]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setMessage("Sesion iniciada correctamente.");
    }

    setBusy(false);
  }

  async function handleGoogleLogin() {
    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre,
          apellido,
          telefono,
          dni,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    if (!data.session || !data.user) {
      setMessage(
        "Cuenta creada. Si en Supabase esta activa la confirmacion por email, confirma el correo y volve luego para completar el onboarding.",
      );
      setBusy(false);
      return;
    }

    await completeOnboarding(data.user);
    setBusy(false);
  }

  async function completeOnboarding(user?: User) {
    if (!supabase || !(user ?? session?.user)) {
      return;
    }

    const currentUser = user ?? session?.user;

    if (!currentUser) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    if (accountType === "admin") {
      if (adminOnboardingMode === "crear") {
        const { data, error: rpcError } = await supabase.rpc("complete_admin_onboarding", {
          p_nombre: nombre,
          p_apellido: apellido,
          p_telefono: telefono,
          p_dni: dni,
          p_consorcio_nombre: consorcioNombre,
          p_consorcio_direccion: consorcioDireccion,
          p_cuit: cuit,
        });

        if (rpcError) {
          setError(rpcError.message);
          setBusy(false);
          return;
        }

        const nextCode = Array.isArray(data) ? data[0]?.codigo_invitacion : undefined;

        setMessage(
          nextCode
            ? `Consorcio creado. Tu codigo de invitacion es ${nextCode}.`
            : "Consorcio creado correctamente.",
        );
      } else if (adminOnboardingMode === "demo") {
        const { data, error: rpcError } = await supabase.rpc("complete_demo_onboarding", {
          p_nombre: nombre,
          p_apellido: apellido,
          p_telefono: telefono,
          p_dni: dni,
          p_consorcio_nombre: consorcioNombre,
          p_consorcio_direccion: consorcioDireccion || "Modo demo Comunitaria",
          p_cuit: cuit,
        });

        if (rpcError) {
          setError(rpcError.message);
          setBusy(false);
          return;
        }

        const nextCode = Array.isArray(data) ? data[0]?.codigo_invitacion : undefined;
        setMessage(
          nextCode
            ? `Modo demo creado. Ya puedes operar gratis hasta 3 unidades. Codigo demo ${nextCode}.`
            : "Modo demo creado correctamente.",
        );
      } else {
        const { error: rpcError } = await supabase.rpc("request_admin_access", {
          p_nombre: nombre,
          p_apellido: apellido,
          p_telefono: telefono,
          p_dni: dni,
          p_codigo_invitacion: inviteCode,
        });

        if (rpcError) {
          setError(rpcError.message);
          setBusy(false);
          return;
        }

        setMessage("Solicitud administrativa enviada. Queda pendiente de aprobacion del consorcio.");
      }
    } else {
      const { error: rpcError } = await supabase.rpc("request_resident_access", {
        p_nombre: nombre,
        p_apellido: apellido,
        p_telefono: telefono,
        p_dni: dni,
        p_unidad_funcional: unidad,
        p_codigo_invitacion: inviteCode,
      });

      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        return;
      }

      setMessage("Solicitud enviada al administrador. Tu acceso queda pendiente de aprobacion.");
    }

    await refreshProfile(currentUser.id);
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

  const profileNeedsOnboarding = Boolean(session?.user) && (!profile?.consorcio_id || !profile?.nombre || !profile?.apellido);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[radial-gradient(circle_at_top_right,_rgba(30,58,138,0.18),_transparent_28%),linear-gradient(180deg,_#eff6ff_0%,_#f3f4f6_48%,_#ffffff_100%)] px-6 py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="glass-panel rounded-[2rem] p-8 lg:p-10">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Auth y onboarding
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
            Acceso real con Supabase para cada consorcio.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
            Email, Google y alta por codigo de invitacion o por creacion de nuevo consorcio. Ahora tambien cubre administradores importados que se suman a un consorcio existente.
          </p>

          <div className="mt-8 grid gap-4">
            <article className="role-card">
              <p className="text-sm font-semibold text-slate-500">Que hace este modulo</p>
              <ul className="mt-3 grid gap-3 text-sm leading-7 text-slate-700">
                <li>Crea usuarios en Supabase Auth con email y password.</li>
                <li>Permite login con Google OAuth.</li>
                <li>Crea el perfil del usuario automaticamente al alta.</li>
                <li>Asigna un administrador a un nuevo consorcio o vincula administradores importados a un consorcio existente.</li>
                <li>Deja pendientes las altas para aprobacion cuando el flujo lo requiere.</li>
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
                Cargar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local y habilitar Email + Google en Supabase Authentication.
              </p>
              {inviteCode ? (
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  Invitacion detectada para el codigo {inviteCode}. El formulario ya quedo preconfigurado para continuar el alta.
                </p>
              ) : null}
            </article>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link className="button-secondary" href="/">
                Volver al inicio
              </Link>
              <Link className="button-secondary" href="/portal">
                Ver portal demo
              </Link>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-8 lg:p-10">
          {loadingSession ? (
            <div className="role-card">
              <p className="text-sm font-semibold text-slate-500">Verificando sesion</p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Cargando estado de autenticacion y perfil del usuario.
              </p>
            </div>
          ) : !configured ? (
            <div className="role-card">
              <p className="text-sm font-semibold text-slate-500">Configuracion pendiente</p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                El flujo ya esta implementado, pero necesita credenciales reales de Supabase para funcionar.
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
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      {session.user.email}
                    </p>
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

              {profileNeedsOnboarding ? (
                <article className="role-card">
                  <div className="flex flex-wrap gap-3">
                    <button
                      className={accountType === "residente" ? "button-primary" : "button-secondary"}
                      onClick={() => setAccountType("residente")}
                      type="button"
                    >
                      Soy residente
                    </button>
                    <button
                      className={accountType === "admin" ? "button-primary" : "button-secondary"}
                      onClick={() => {
                        setAccountType("admin");
                        setAdminOnboardingMode("crear");
                      }}
                      type="button"
                    >
                      Soy administrador
                    </button>
                  </div>

                  {accountType === "admin" ? (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        className={adminOnboardingMode === "crear" ? "button-primary" : "button-secondary"}
                        onClick={() => setAdminOnboardingMode("crear")}
                        type="button"
                      >
                        Crear consorcio
                      </button>
                      <button
                        className={adminOnboardingMode === "demo" ? "button-primary" : "button-secondary"}
                        onClick={() => setAdminOnboardingMode("demo")}
                        type="button"
                      >
                        Probar gratis modo demo
                      </button>
                      <button
                        className={adminOnboardingMode === "sumarme" ? "button-primary" : "button-secondary"}
                        onClick={() => setAdminOnboardingMode("sumarme")}
                        type="button"
                      >
                        Sumarme a un consorcio existente
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="field-label">Nombre</span>
                      <input className="field mt-2" onChange={(event) => setNombre(event.target.value)} value={nombre} />
                    </label>
                    <label>
                      <span className="field-label">Apellido</span>
                      <input className="field mt-2" onChange={(event) => setApellido(event.target.value)} value={apellido} />
                    </label>
                    <label>
                      <span className="field-label">Telefono</span>
                      <input className="field mt-2" onChange={(event) => setTelefono(event.target.value)} value={telefono} />
                    </label>
                    <label>
                      <span className="field-label">DNI</span>
                      <input className="field mt-2" onChange={(event) => setDni(event.target.value)} value={dni} />
                    </label>

                    {accountType === "admin" && (adminOnboardingMode === "crear" || adminOnboardingMode === "demo") ? (
                      <>
                        <label>
                          <span className="field-label">{adminOnboardingMode === "demo" ? "Nombre del espacio demo" : "Nombre del consorcio"}</span>
                          <input className="field mt-2" onChange={(event) => setConsorcioNombre(event.target.value)} value={consorcioNombre} />
                        </label>
                        <label>
                          <span className="field-label">{adminOnboardingMode === "demo" ? "Descripcion corta" : "Direccion"}</span>
                          <input className="field mt-2" onChange={(event) => setConsorcioDireccion(event.target.value)} value={consorcioDireccion} />
                        </label>
                        <label className="md:col-span-2">
                          <span className="field-label">CUIT</span>
                          <input className="field mt-2" onChange={(event) => setCuit(event.target.value)} value={cuit} />
                        </label>
                      </>
                    ) : accountType === "admin" ? (
                      <label className="md:col-span-2">
                        <span className="field-label">Codigo de consorcio</span>
                        <input className="field mt-2 uppercase" onChange={(event) => setInviteCode(event.target.value.toUpperCase())} value={inviteCode} />
                      </label>
                    ) : (
                      <>
                        <label>
                          <span className="field-label">Codigo de consorcio</span>
                          <input className="field mt-2 uppercase" onChange={(event) => setInviteCode(event.target.value.toUpperCase())} value={inviteCode} />
                        </label>
                        <label>
                          <span className="field-label">Unidad funcional</span>
                          <input className="field mt-2 uppercase" onChange={(event) => setUnidad(event.target.value.toUpperCase())} value={unidad} />
                        </label>
                      </>
                    )}
                  </div>

                  <div className="mt-6">
                    <button className="button-primary" disabled={busy} onClick={() => void completeOnboarding()} type="button">
                      {busy ? "Guardando..." : accountType === "admin" && adminOnboardingMode === "sumarme" ? "Solicitar acceso como administrador" : accountType === "admin" && adminOnboardingMode === "demo" ? "Activar demo ahora" : accountType === "admin" ? "Crear consorcio ahora" : "Unirme ahora"}
                    </button>
                  </div>
                </article>
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
                        {tenant?.nombre ?? "Pendiente"}
                      </p>
                      {tenant?.es_demo ? <p className="mt-2 text-sm leading-7 text-emerald-700">Tenant demo activo · limite {tenant.demo_unit_limit} unidades funcionales.</p> : null}
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Direccion</p>
                      <p className="mt-2 text-base text-slate-700">{tenant?.direccion ?? "Sin asignar"}</p>
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Codigo</p>
                      <p className="mt-2 text-base font-semibold text-slate-900">
                        {tenant?.codigo_invitacion ?? "Sin codigo"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {profile?.estado === "activo" ? (
                      <Link className="button-primary" href={portalRouteByRole[profile.rol]}>
                        Abrir portal {roleLabel[profile.rol]}
                      </Link>
                    ) : (
                      <span className="status-badge status-badge--warning">
                        Esperando aprobacion del administrador
                      </span>
                    )}
                    <Link className="button-secondary" href="/portal">
                      Ver demo funcional
                    </Link>
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
                <button
                  className={mode === "login" ? "button-primary" : "button-secondary"}
                  onClick={() => setMode("login")}
                  type="button"
                >
                  Ingresar
                </button>
                <button
                  className={mode === "register" ? "button-primary" : "button-secondary"}
                  onClick={() => setMode("register")}
                  type="button"
                >
                  Crear cuenta
                </button>
              </div>

              {mode === "login" ? (
                <form className="grid gap-4" onSubmit={handleLogin}>
                  <label>
                    <span className="field-label">Email</span>
                    <input className="field mt-2" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                  </label>
                  <label>
                    <span className="field-label">Contrasena</span>
                    <input className="field mt-2" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                  </label>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button className="button-primary" disabled={busy} type="submit">
                      {busy ? "Ingresando..." : "Ingresar"}
                    </button>
                    <button className="button-secondary" disabled={busy} onClick={() => void handleGoogleLogin()} type="button">
                      Continuar con Google
                    </button>
                  </div>
                </form>
              ) : (
                <form className="grid gap-4" onSubmit={handleRegister}>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className={accountType === "residente" ? "button-primary" : "button-secondary"}
                      onClick={() => setAccountType("residente")}
                      type="button"
                    >
                      Cuenta de residente
                    </button>
                    <button
                      className={accountType === "admin" ? "button-primary" : "button-secondary"}
                      onClick={() => { setAccountType("admin"); setAdminOnboardingMode(invitePrefill.adminMode); }}
                      type="button"
                    >
                      Cuenta de administrador
                    </button>
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
                      <input className="field mt-2" onChange={(event) => setDni(event.target.value)} value={dni} />
                    </label>
                    <label>
                      <span className="field-label">Email</span>
                      <input className="field mt-2" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                    </label>
                    <label>
                      <span className="field-label">Contrasena</span>
                      <input className="field mt-2" minLength={6} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                    </label>

                    {accountType === "admin" ? (
                      <>
                        <div className="md:col-span-2 flex flex-wrap gap-3">
                          <button className={adminOnboardingMode === "demo" ? "button-primary" : "button-secondary"} onClick={() => setAdminOnboardingMode("demo")} type="button">Modo demo gratis</button>
                          <button className={adminOnboardingMode === "crear" ? "button-primary" : "button-secondary"} onClick={() => setAdminOnboardingMode("crear")} type="button">Consorcio real</button>
                          <button className={adminOnboardingMode === "sumarme" ? "button-primary" : "button-secondary"} onClick={() => setAdminOnboardingMode("sumarme")} type="button">Sumarme con codigo</button>
                        </div>
                        {adminOnboardingMode === "sumarme" ? (
                          <label className="md:col-span-2">
                            <span className="field-label">Codigo de consorcio</span>
                            <input className="field mt-2 uppercase" onChange={(event) => setInviteCode(event.target.value.toUpperCase())} required value={inviteCode} />
                          </label>
                        ) : (
                          <>
                            <label>
                              <span className="field-label">{adminOnboardingMode === "demo" ? "Nombre del espacio demo" : "Nombre del consorcio"}</span>
                              <input className="field mt-2" onChange={(event) => setConsorcioNombre(event.target.value)} required value={consorcioNombre} />
                            </label>
                            <label>
                              <span className="field-label">{adminOnboardingMode === "demo" ? "Descripcion corta" : "Direccion"}</span>
                              <input className="field mt-2" onChange={(event) => setConsorcioDireccion(event.target.value)} required value={consorcioDireccion} />
                            </label>
                            <label className="md:col-span-2">
                              <span className="field-label">CUIT</span>
                              <input className="field mt-2" onChange={(event) => setCuit(event.target.value)} value={cuit} />
                            </label>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <label>
                          <span className="field-label">Codigo de consorcio</span>
                          <input className="field mt-2 uppercase" onChange={(event) => setInviteCode(event.target.value.toUpperCase())} required value={inviteCode} />
                        </label>
                        <label>
                          <span className="field-label">Unidad funcional</span>
                          <input className="field mt-2 uppercase" onChange={(event) => setUnidad(event.target.value.toUpperCase())} required value={unidad} />
                        </label>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button className="button-primary" disabled={busy} type="submit">
                      {busy ? "Creando..." : accountType === "admin" && adminOnboardingMode === "demo" ? "Crear cuenta y activar demo" : accountType === "admin" && adminOnboardingMode === "crear" ? "Crear cuenta y consorcio" : accountType === "admin" ? "Crear cuenta y solicitar acceso" : "Crear cuenta y unirme"}
                    </button>
                    <button className="button-secondary" disabled={busy} onClick={() => void handleGoogleLogin()} type="button">
                      Continuar con Google
                    </button>
                  </div>
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