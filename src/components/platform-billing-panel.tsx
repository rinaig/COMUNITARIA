"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRecord } from "@/lib/auth-types";
import { CollapsiblePanelSection } from "@/components/collapsible-panel-section";
import { HOME_CONTENT_STORAGE_KEY, HOME_IMAGE_OPTIONS, normalizeHomeContent, type HomeContentConfig, type HomeModuleContent } from "@/lib/home-content";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { PLATFORM_PUBLIC_SETTINGS_STORAGE_KEY, getCompatIssueMessage, loadPlatformSettingsCompat, savePlatformSettingsCompat, type PlatformSettingsCompatRow } from "@/lib/platform-schema-compat";

type Tenant = {
  id: string;
  nombre: string;
  cantidad_unidades: number;
  trial_unit_limit: number;
  trial_guard_post_limit: number;
};

type SubscriptionRow = {
  id: string;
  consorcio_id: string;
  admin_id: string | null;
  plan: "base" | "barrio" | "premium";
  estado: "trial" | "activa" | "past_due" | "pausada" | "cancelada";
  precio_lista_por_unidad: number;
  unit_price_override: number | null;
  trial_expires_at: string | null;
  proximo_vencimiento: string | null;
  observaciones: string | null;
  ultimo_pago_at: string | null;
};

type PaymentRow = {
  id: string;
  suscripcion_id: string;
  consorcio_id: string;
  importe: number;
  estado: "pagado" | "pendiente" | "vencido" | "fallido";
  metodo: string | null;
  referencia: string | null;
  fecha_pago: string | null;
  nota: string | null;
  created_at: string;
};

const planOptions: SubscriptionRow["plan"][] = ["base", "barrio", "premium"];
const subscriptionStatusOptions: SubscriptionRow["estado"][] = ["trial", "activa", "past_due", "pausada", "cancelada"];

function getPaymentStatusLabel(status: PaymentRow["estado"]) {
  if (status === "pagado") {
    return "aprobado";
  }

  if (status === "fallido") {
    return "rechazado";
  }

  if (status === "vencido") {
    return "vencido";
  }

  return "pendiente";
}

function getPaymentStatusClassName(status: PaymentRow["estado"]) {
  if (status === "pagado") {
    return "status-badge status-badge--success";
  }

  if (status === "fallido") {
    return "rounded-full bg-rose-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-rose-700";
  }

  if (status === "vencido") {
    return "status-badge status-badge--warning";
  }

  return "rounded-full bg-amber-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-700";
}

function getEffectiveUnitPrice(subscription: SubscriptionRow | null, defaultUnitPrice: string) {
  if (!subscription) {
    return Number(defaultUnitPrice || 0);
  }

  return Number(subscription.unit_price_override ?? subscription.precio_lista_por_unidad ?? Number(defaultUnitPrice || 0));
}

function getTrialExpiryValue(value: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T23:59:59`).toISOString();
}

export function PlatformBillingPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [savingGlobalPrice, setSavingGlobalPrice] = useState(false);
  const [savingHomeContent, setSavingHomeContent] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [reviewingPaymentId, setReviewingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [schemaWarning, setSchemaWarning] = useState("");
  const [billingWarning, setBillingWarning] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [defaultUnitPrice, setDefaultUnitPrice] = useState("0");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [plan, setPlan] = useState<SubscriptionRow["plan"]>("base");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionRow["estado"]>("trial");
  const [trialExpiryDate, setTrialExpiryDate] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");
  const [specialUnitPrice, setSpecialUnitPrice] = useState("");
  const [trialUnitLimit, setTrialUnitLimit] = useState("3");
  const [trialGuardPostLimit, setTrialGuardPostLimit] = useState("1");
  const [homeContent, setHomeContent] = useState<HomeContentConfig>(() => normalizeHomeContent(undefined));

  const syncSelectedSubscriptionForm = useCallback((subscription: SubscriptionRow | null, tenant: Tenant | null) => {
    setPlan(subscription?.plan ?? "base");
    setSubscriptionStatus(subscription?.estado ?? "trial");
    setTrialExpiryDate(subscription?.trial_expires_at ? subscription.trial_expires_at.slice(0, 10) : "");
    setNextDueDate(subscription?.proximo_vencimiento ?? "");
    setSubscriptionNotes(subscription?.observaciones ?? "");
    setSpecialUnitPrice(subscription?.unit_price_override == null ? "" : String(subscription.unit_price_override));
    setTrialUnitLimit(String(tenant?.trial_unit_limit ?? 3));
    setTrialGuardPostLimit(String(tenant?.trial_guard_post_limit ?? 1));
  }, []);

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");
    setSchemaWarning("");
    setBillingWarning("");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, nombre, apellido, telefono, dni, unidad_funcional, rol, estado, consorcio_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const nextProfile = (profileData as ProfileRecord | null) ?? null;
    setProfile(nextProfile);

    if (!nextProfile || nextProfile.rol !== "superadmin") {
      setLoading(false);
      return;
    }

    const settingsCompat = await loadPlatformSettingsCompat(supabase);
    if (settingsCompat.error) {
      setError(settingsCompat.error);
      setLoading(false);
      return;
    }

    const settings = settingsCompat.data;

    setDefaultUnitPrice(String(settings.default_unit_price ?? 0));
    setSupportEmail(settings.support_email ?? "");
    setSupportPhone(settings.support_phone ?? "");
    setInstagramUrl(settings.instagram_url ?? "");
    setLinkedinUrl(settings.linkedin_url ?? "");
    setXUrl(settings.x_url ?? "");
    setFacebookUrl(settings.facebook_url ?? "");
    setHomeContent(settings.home_content);
    setSchemaWarning(settingsCompat.warning ?? "");

    const [tenantsResult, subscriptionsResult, paymentsResult] = await Promise.allSettled([
      supabase.from("consorcios").select("id, nombre, cantidad_unidades, trial_unit_limit, trial_guard_post_limit").order("nombre", { ascending: true }),
      supabase.from("consorcio_suscripciones").select("id, consorcio_id, admin_id, plan, estado, precio_lista_por_unidad, unit_price_override, trial_expires_at, proximo_vencimiento, observaciones, ultimo_pago_at").order("created_at", { ascending: false }),
      supabase.from("admin_payment_events").select("id, suscripcion_id, consorcio_id, importe, estado, metodo, referencia, fecha_pago, nota, created_at").order("created_at", { ascending: false }).limit(30),
    ]);

    const warnings: string[] = [];
    let nextTenants: Tenant[] = [];
    let nextSubscriptions: SubscriptionRow[] = [];

    if (tenantsResult.status === "fulfilled") {
      if (tenantsResult.value.error) {
        warnings.push(getCompatIssueMessage("Consorcios", tenantsResult.value.error));
      } else {
        nextTenants = (tenantsResult.value.data as Tenant[] | null) ?? [];
        setTenants(nextTenants);
      }
    } else {
      warnings.push(getCompatIssueMessage("Consorcios", tenantsResult.reason));
    }

    if (subscriptionsResult.status === "fulfilled") {
      if (subscriptionsResult.value.error) {
        warnings.push(getCompatIssueMessage("Suscripciones", subscriptionsResult.value.error));
      } else {
        nextSubscriptions = (subscriptionsResult.value.data as SubscriptionRow[] | null) ?? [];
        setSubscriptions(nextSubscriptions);
      }
    } else {
      warnings.push(getCompatIssueMessage("Suscripciones", subscriptionsResult.reason));
    }

    if (paymentsResult.status === "fulfilled") {
      if (paymentsResult.value.error) {
        warnings.push(getCompatIssueMessage("Pagos", paymentsResult.value.error));
      } else {
        setPayments((paymentsResult.value.data as PaymentRow[] | null) ?? []);
      }
    } else {
      warnings.push(getCompatIssueMessage("Pagos", paymentsResult.reason));
    }

    if (warnings.length > 0) {
      setBillingWarning(warnings.join(" "));
    }

    const nextSelectedTenantId = selectedTenantId || nextTenants[0]?.id || "";
    if (nextSelectedTenantId) {
      setSelectedTenantId(nextSelectedTenantId);
      syncSelectedSubscriptionForm(
        nextSubscriptions.find((item) => item.consorcio_id === nextSelectedTenantId) ?? null,
        nextTenants.find((item) => item.id === nextSelectedTenantId) ?? null,
      );
    }

    setLoading(false);
  }, [selectedTenantId, supabase, syncSelectedSubscriptionForm]);

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
        await loadData(data.session.user.id);
      } else {
        setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [loadData, supabase]);

  const selectedSubscription = subscriptions.find((item) => item.consorcio_id === selectedTenantId) ?? null;
  const selectedTenant = tenants.find((item) => item.id === selectedTenantId) ?? null;
  const effectiveUnitPrice = getEffectiveUnitPrice(selectedSubscription, defaultUnitPrice);
  const estimatedMonthly = effectiveUnitPrice * Number(selectedTenant?.cantidad_unidades ?? 0);
  const linkedinPendingMigration = schemaWarning.toLowerCase().includes("linkedin");

  function buildSettingsPayload(): PlatformSettingsCompatRow {
    return {
      default_unit_price: Number(defaultUnitPrice || 0),
      support_email: supportEmail.trim() || null,
      support_phone: supportPhone.trim() || null,
      instagram_url: instagramUrl.trim() || null,
      linkedin_url: linkedinUrl.trim() || null,
      x_url: xUrl.trim() || null,
      facebook_url: facebookUrl.trim() || null,
      home_content: homeContent,
    };
  }

  function persistHomeContentPreview(nextHomeContent: HomeContentConfig) {
    try {
      window.localStorage.setItem(HOME_CONTENT_STORAGE_KEY, JSON.stringify(nextHomeContent));
    } catch {
      // ignore local preview persistence errors
    }
  }

  function persistPublicSettingsPreview(payload: PlatformSettingsCompatRow) {
    try {
      window.localStorage.setItem(PLATFORM_PUBLIC_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore local preview persistence errors
    }
  }

  function updateHomeContentField<K extends keyof HomeContentConfig>(field: K, value: HomeContentConfig[K]) {
    setHomeContent((current) => ({ ...current, [field]: value }));
  }

  function updateHomeModule(moduleId: HomeModuleContent["id"], updater: (module: HomeModuleContent) => HomeModuleContent) {
    setHomeContent((current) => ({
      ...current,
      modules: current.modules.map((module) => module.id === moduleId ? updater(module) : module),
    }));
  }

  function handleTenantSelection(nextTenantId: string) {
    setSelectedTenantId(nextTenantId);
    syncSelectedSubscriptionForm(
      subscriptions.find((item) => item.consorcio_id === nextTenantId) ?? null,
      tenants.find((item) => item.id === nextTenantId) ?? null,
    );
  }

  async function handleDefaultUnitPriceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    setSavingGlobalPrice(true);
    setError("");
    setMessage("");

    const settingsPayload = buildSettingsPayload();
    const saveResult = await savePlatformSettingsCompat(supabase, settingsPayload);

    if (saveResult.error) {
      persistPublicSettingsPreview(settingsPayload);
      setSchemaWarning(getCompatIssueMessage("Configuracion publica", saveResult.error));
      setMessage("No se pudo guardar en la base ahora. La vista previa local sigue disponible en esta sesion.");
      setSavingGlobalPrice(false);
      return;
    }

    persistPublicSettingsPreview(settingsPayload);

    setSchemaWarning(saveResult.warning ?? schemaWarning);

    const subscriptionIdsWithoutOverride = subscriptions.filter((item) => item.unit_price_override == null).map((item) => item.id);
    if (subscriptionIdsWithoutOverride.length > 0) {
      const { error: defaultPriceError } = await supabase
        .from("consorcio_suscripciones")
        .update({ precio_lista_por_unidad: Number(defaultUnitPrice || 0) })
        .in("id", subscriptionIdsWithoutOverride);

      if (defaultPriceError) {
        setBillingWarning(getCompatIssueMessage("Suscripciones", defaultPriceError));
      } else {
        setSubscriptions((current) => current.map((item) => item.unit_price_override == null ? { ...item, precio_lista_por_unidad: Number(defaultUnitPrice || 0) } : item));
      }
    }

    setMessage("Configuracion general de plataforma actualizada.");
    setSavingGlobalPrice(false);
  }

  async function handleHomeContentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    setSavingHomeContent(true);
    setError("");
    setMessage("");

    const normalizedHomeContent = normalizeHomeContent(homeContent);
    const settingsPayload = {
      ...buildSettingsPayload(),
      home_content: normalizedHomeContent,
    };
    const saveResult = await savePlatformSettingsCompat(supabase, settingsPayload);

    if (saveResult.error) {
      setHomeContent(normalizedHomeContent);
      persistHomeContentPreview(normalizedHomeContent);
      persistPublicSettingsPreview(settingsPayload);
      setSchemaWarning(getCompatIssueMessage("Home publico", saveResult.error));
      setMessage("No se pudo persistir el home en la base ahora, pero esta sesion local ya muestra la portada actualizada.");
      setSavingHomeContent(false);
      return;
    }

    setHomeContent(normalizedHomeContent);
    persistHomeContentPreview(normalizedHomeContent);
    setSchemaWarning(saveResult.warning ?? schemaWarning);
    setMessage(saveResult.warning?.toLowerCase().includes("home")
      ? "Contenido del home actualizado. Esta sesion local ya muestra la nueva portada."
      : "Contenido del home actualizado.");
    setSavingHomeContent(false);
  }

  async function handleSubscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedTenantId) {
      return;
    }

    setSavingSubscription(true);
    setError("");
    setMessage("");

    const parsedTrialUnitLimit = Number.parseInt(trialUnitLimit, 10);
    const parsedTrialGuardPostLimit = Number.parseInt(trialGuardPostLimit, 10);

    if (Number.isNaN(parsedTrialUnitLimit) || parsedTrialUnitLimit < 0) {
      setError("El limite de unidades de prueba debe ser un entero igual o mayor a 0.");
      setSavingSubscription(false);
      return;
    }

    if (Number.isNaN(parsedTrialGuardPostLimit) || parsedTrialGuardPostLimit < 0) {
      setError("El limite de puestos de vigilancia de prueba debe ser un entero igual o mayor a 0.");
      setSavingSubscription(false);
      return;
    }

    const overrideValue = specialUnitPrice.trim() === "" ? null : Number(specialUnitPrice);
    const nextEffectiveUnitPrice = overrideValue ?? Number(defaultUnitPrice || 0);
    const payload = {
      consorcio_id: selectedTenantId,
      admin_id: selectedSubscription?.admin_id ?? null,
      plan,
      estado: subscriptionStatus,
      precio_lista_por_unidad: Number(defaultUnitPrice || 0),
      unit_price_override: overrideValue,
      monto_mensual: nextEffectiveUnitPrice * Number(selectedTenant?.cantidad_unidades ?? 0),
      trial_expires_at: getTrialExpiryValue(trialExpiryDate),
      proximo_vencimiento: nextDueDate || null,
      observaciones: subscriptionNotes || null,
    };

    const { error: tenantUpdateError } = await supabase
      .from("consorcios")
      .update({
        trial_unit_limit: parsedTrialUnitLimit,
        trial_guard_post_limit: parsedTrialGuardPostLimit,
      })
      .eq("id", selectedTenantId);

    if (tenantUpdateError) {
      setError(tenantUpdateError.message);
      setSavingSubscription(false);
      return;
    }

    const query = selectedSubscription
      ? supabase.from("consorcio_suscripciones").update(payload).eq("id", selectedSubscription.id)
      : supabase.from("consorcio_suscripciones").insert(payload);

    const { error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setSavingSubscription(false);
      return;
    }

    setMessage("Configuracion especial guardada.");
    if (session?.user) {
      await loadData(session.user.id);
    }
    setSavingSubscription(false);
  }

  async function handlePaymentReview(payment: PaymentRow, nextStatus: PaymentRow["estado"]) {
    if (!supabase) {
      return;
    }

    setReviewingPaymentId(payment.id);
    setError("");
    setMessage("");

    const { error: paymentError } = await supabase
      .from("admin_payment_events")
      .update({ estado: nextStatus })
      .eq("id", payment.id);

    if (paymentError) {
      setError(paymentError.message);
      setReviewingPaymentId(null);
      return;
    }

    if (nextStatus === "pagado") {
      await supabase
        .from("consorcio_suscripciones")
        .update({ estado: "activa", ultimo_pago_at: payment.fecha_pago ?? new Date().toISOString() })
        .eq("id", payment.suscripcion_id);
    }

    if (nextStatus === "fallido") {
      await supabase
        .from("consorcio_suscripciones")
        .update({ estado: "past_due" })
        .eq("id", payment.suscripcion_id);
    }

    setMessage(nextStatus === "pagado" ? "Transferencia aprobada y acceso habilitado." : nextStatus === "fallido" ? "Transferencia rechazada." : "Transferencia marcada como pendiente.");
    if (session?.user) {
      await loadData(session.user.id);
    }
    setReviewingPaymentId(null);
  }

  if (!configured || profile?.rol !== "superadmin") {
    return null;
  }

  return (
    <div>
      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {schemaWarning ? <article className="role-card mt-6 border-slate-200 bg-slate-50/80"><p className="text-sm font-semibold text-slate-700">Compatibilidad</p><p className="mt-2 text-sm leading-7 text-slate-600">{schemaWarning}</p></article> : null}
      {billingWarning ? <article className="role-card mt-6 border-slate-200 bg-slate-50/80"><p className="text-sm font-semibold text-slate-700">Facturacion comercial</p><p className="mt-2 text-sm leading-7 text-slate-600">{billingWarning}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}
      <CollapsiblePanelSection defaultOpen eyebrow="Home publico" subtitle="Aqui defines el texto definitivo de la portada, el modal de bienvenida y los 6 modulos inferiores. Los cambios quedan listos para la vista local y, cuando la base tenga la migracion, tambien se persistiran en platform_settings." title="Portada, bienvenida y modulos configurables">
        <form className="grid gap-6" onSubmit={handleHomeContentSubmit}>
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="role-card grid gap-4">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Hero y modal</p>
              <label><span className="field-label">Bajada superior</span><input className="field mt-2" onChange={(event) => updateHomeContentField("heroEyebrow", event.target.value)} value={homeContent.heroEyebrow} /></label>
              <label><span className="field-label">Titulo principal</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeContentField("heroTitle", event.target.value)} value={homeContent.heroTitle} /></label>
              <label><span className="field-label">Descripcion principal</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeContentField("heroDescription", event.target.value)} value={homeContent.heroDescription} /></label>
              <label><span className="field-label">Etiqueta del recuadro visual</span><input className="field mt-2" onChange={(event) => updateHomeContentField("heroPanelEyebrow", event.target.value)} value={homeContent.heroPanelEyebrow} /></label>
              <label><span className="field-label">Texto del recuadro visual</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeContentField("heroPanelTitle", event.target.value)} value={homeContent.heroPanelTitle} /></label>
              <label><span className="field-label">Etiqueta del modal</span><input className="field mt-2" onChange={(event) => updateHomeContentField("welcomeEyebrow", event.target.value)} value={homeContent.welcomeEyebrow} /></label>
              <label><span className="field-label">Titulo del modal</span><input className="field mt-2" onChange={(event) => updateHomeContentField("welcomeTitle", event.target.value)} value={homeContent.welcomeTitle} /></label>
              <label><span className="field-label">Descripcion del modal</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeContentField("welcomeDescription", event.target.value)} value={homeContent.welcomeDescription} /></label>
              <label><span className="field-label">Etiqueta de la seccion de modulos</span><input className="field mt-2" onChange={(event) => updateHomeContentField("modulesSectionEyebrow", event.target.value)} value={homeContent.modulesSectionEyebrow} /></label>
              <label><span className="field-label">Titulo de la seccion de modulos</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeContentField("modulesSectionTitle", event.target.value)} value={homeContent.modulesSectionTitle} /></label>
            </div>

            <div className="grid gap-4">
              {homeContent.modules.map((module) => (
                <article className="role-card grid gap-4" key={module.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Modulo {module.id}</p>
                      <h4 className="mt-2 text-lg font-semibold text-slate-950">{module.title}</h4>
                    </div>
                    <div className="relative h-20 w-28 overflow-hidden rounded-2xl border border-slate-200 bg-white/90">
                      <Image alt={module.alt} className="object-cover" fill sizes="112px" src={module.image} />
                    </div>
                  </div>
                  <label><span className="field-label">Titulo</span><input className="field mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, title: event.target.value }))} value={module.title} /></label>
                  <label><span className="field-label">Descripcion corta</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, description: event.target.value }))} value={module.description} /></label>
                  <label><span className="field-label">Resumen visible</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, summary: event.target.value }))} value={module.summary} /></label>
                  <label><span className="field-label">Titulo del desplegable</span><input className="field mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, detailTitle: event.target.value }))} value={module.detailTitle} /></label>
                  <label><span className="field-label">Imagen</span><select className="field-select mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, image: event.target.value }))} value={module.image}>{HOME_IMAGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label><span className="field-label">Texto alternativo</span><input className="field mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, alt: event.target.value }))} value={module.alt} /></label>
                  <label><span className="field-label">Detalle ampliado</span><textarea className="field-textarea mt-2" onChange={(event) => updateHomeModule(module.id, (current) => ({ ...current, details: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }))} value={module.details.join("\n")} /></label>
                </article>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="button-primary" disabled={savingHomeContent || loading} type="submit">{savingHomeContent ? "Guardando..." : "Guardar portada publica"}</button>
          </div>
        </form>
      </CollapsiblePanelSection>

      <CollapsiblePanelSection defaultOpen eyebrow="Configuracion general" subtitle="Controla los datos visibles del home, redes y valor unitario base del esquema comercial." title="Configuracion publica y precio general">
        <form className="role-card grid gap-4" onSubmit={handleDefaultUnitPriceSubmit}>
          <label><span className="field-label">Monto general</span><input className="field mt-2" min="0" onChange={(event) => setDefaultUnitPrice(event.target.value)} required step="0.01" type="number" value={defaultUnitPrice} /></label>
          <label><span className="field-label">Email visible en el home</span><input className="field mt-2" onChange={(event) => setSupportEmail(event.target.value)} placeholder="soporte@comunitaria.app" type="email" value={supportEmail} /></label>
          <label><span className="field-label">Telefono visible en el home</span><input className="field mt-2" onChange={(event) => setSupportPhone(event.target.value)} placeholder="+54 9 11 ..." type="text" value={supportPhone} /></label>
          <label><span className="field-label">Instagram</span><input className="field mt-2" onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/..." type="url" value={instagramUrl} /></label>
          <label><span className="field-label">LinkedIn</span><input className="field mt-2" onChange={(event) => setLinkedinUrl(event.target.value)} placeholder="https://linkedin.com/company/..." type="url" value={linkedinUrl} /></label>
          {linkedinPendingMigration ? <p className="text-sm leading-7 text-slate-600">LinkedIn quedara operativo en cuanto se aplique la migracion pendiente de base de datos. El resto de la configuracion ya se guarda y se refleja normalmente.</p> : null}
          <label><span className="field-label">X</span><input className="field mt-2" onChange={(event) => setXUrl(event.target.value)} placeholder="https://x.com/..." type="url" value={xUrl} /></label>
          <label><span className="field-label">Facebook</span><input className="field mt-2" onChange={(event) => setFacebookUrl(event.target.value)} placeholder="https://facebook.com/..." type="url" value={facebookUrl} /></label>
          <button className="button-primary" disabled={savingGlobalPrice || loading} type="submit">{savingGlobalPrice ? "Guardando..." : "Guardar configuracion general"}</button>
        </form>
      </CollapsiblePanelSection>

      <CollapsiblePanelSection eyebrow="Planes por consorcio" subtitle="Ajusta la situacion comercial, topes de prueba y vencimientos de cada administrador sin recorrer toda la pagina." title="Plan especial por consorcio">
        <form className="role-card grid gap-4" onSubmit={handleSubscriptionSubmit}>
          <label><span className="field-label">Consorcio</span><select className="field-select mt-2" onChange={(event) => handleTenantSelection(event.target.value)} value={selectedTenantId}>{tenants.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label><span className="field-label">Plan</span><select className="field-select mt-2" onChange={(event) => setPlan(event.target.value as SubscriptionRow["plan"])} value={plan}>{planOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="field-label">Estado comercial</span><select className="field-select mt-2" onChange={(event) => setSubscriptionStatus(event.target.value as SubscriptionRow["estado"])} value={subscriptionStatus}>{subscriptionStatusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="field-label">Monto general vigente</span><input className="field mt-2" disabled value={`$ ${Number(defaultUnitPrice || 0).toLocaleString("es-AR")}`} /></label>
          <label><span className="field-label">Monto especial por unidad</span><input className="field mt-2" min="0" onChange={(event) => setSpecialUnitPrice(event.target.value)} placeholder="Dejar vacio para usar el general" step="0.01" type="number" value={specialUnitPrice} /></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label><span className="field-label">Limite trial de unidades</span><input className="field mt-2" min="0" onChange={(event) => setTrialUnitLimit(event.target.value)} step="1" type="number" value={trialUnitLimit} /></label>
            <label><span className="field-label">Limite trial de puestos</span><input className="field mt-2" min="0" onChange={(event) => setTrialGuardPostLimit(event.target.value)} step="1" type="number" value={trialGuardPostLimit} /></label>
          </div>
          <label><span className="field-label">Vencimiento de prueba</span><input className="field mt-2" onChange={(event) => setTrialExpiryDate(event.target.value)} type="date" value={trialExpiryDate} /></label>
          <label><span className="field-label">Proximo vencimiento</span><input className="field mt-2" onChange={(event) => setNextDueDate(event.target.value)} type="date" value={nextDueDate} /></label>
          <label><span className="field-label">Observaciones</span><textarea className="field-textarea mt-2" onChange={(event) => setSubscriptionNotes(event.target.value)} value={subscriptionNotes} /></label>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Aplicacion del precio</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">$ {effectiveUnitPrice.toLocaleString("es-AR")}</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">{specialUnitPrice.trim() === "" ? "Usa el monto general." : "Usa un plan especial para este consorcio."} Total estimado: $ {estimatedMonthly.toLocaleString("es-AR")}.</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">Prueba operativa: hasta {trialUnitLimit || "0"} unidades funcionales y {trialGuardPostLimit || "0"} puestos de vigilancia.</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">{trialExpiryDate ? `Vence el ${new Date(`${trialExpiryDate}T00:00:00`).toLocaleDateString("es-AR")}.` : "Sin fecha de prueba definida."}</p>
          </div>
          <button className="button-primary" disabled={savingSubscription || loading} type="submit">{savingSubscription ? "Guardando..." : "Guardar plan especial"}</button>
        </form>
      </CollapsiblePanelSection>

      <CollapsiblePanelSection eyebrow="Estado por consorcio" title="Suscripciones registradas y transferencias reportadas">
        <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado por consorcio</p>
            <div className="mt-4 grid gap-3">
              {loading ? <p className="text-sm leading-7 text-slate-600">Cargando suscripciones.</p> : subscriptions.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay suscripciones registradas.</p> : subscriptions.map((item) => {
                const tenant = tenants.find((tenantItem) => tenantItem.id === item.consorcio_id);
                const itemEffectiveUnitPrice = Number(item.unit_price_override ?? item.precio_lista_por_unidad ?? 0);
                const itemMonthly = itemEffectiveUnitPrice * Number(tenant?.cantidad_unidades ?? 0);
                return <button className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-colors hover:border-slate-300" key={item.id} onClick={() => handleTenantSelection(item.consorcio_id)} type="button"><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{tenant?.nombre ?? item.consorcio_id}</h4><span className="status-badge status-badge--neutral">{item.estado}</span></div><p className="mt-2 text-sm leading-7 text-slate-600">Plan {item.plan} · $ {itemMonthly.toLocaleString("es-AR")}/mes</p><p className="mt-1 text-sm leading-7 text-slate-600">$ {itemEffectiveUnitPrice.toLocaleString("es-AR")} por unidad · {item.unit_price_override == null ? "General" : "Especial"}</p><p className="mt-1 text-sm leading-7 text-slate-600">Trial: {tenant?.trial_unit_limit ?? 3} unidades · {tenant?.trial_guard_post_limit ?? 1} puestos.</p><p className="mt-1 text-sm leading-7 text-slate-600">{item.trial_expires_at ? `Vence ${new Date(item.trial_expires_at).toLocaleDateString("es-AR")}` : "Sin fecha de prueba"}</p></button>;
              })}
            </div>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Transferencias reportadas</p>
            <div className="mt-4 grid gap-3">
              {payments.length === 0 ? <p className="text-sm leading-7 text-slate-600">Aun no hay transferencias reportadas por administradores.</p> : payments.map((item) => {
                const tenant = tenants.find((tenantItem) => tenantItem.id === item.consorcio_id);
                const busy = reviewingPaymentId === item.id;
                return <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="text-lg font-semibold text-slate-950">{tenant?.nombre ?? item.consorcio_id}</h4><p className="mt-1 text-sm leading-7 text-slate-600">Transferencia {item.fecha_pago ? new Date(item.fecha_pago).toLocaleDateString("es-AR") : new Date(item.created_at).toLocaleDateString("es-AR")}</p></div><span className={getPaymentStatusClassName(item.estado)}>{getPaymentStatusLabel(item.estado)}</span></div><div className="mt-4 grid gap-2 text-sm leading-7 text-slate-600 sm:grid-cols-3"><p><span className="font-semibold text-slate-900">Monto:</span> $ {Number(item.importe).toLocaleString("es-AR")}</p><p><span className="font-semibold text-slate-900">Metodo:</span> {item.metodo ?? "Transferencia"}</p><p><span className="font-semibold text-slate-900">Referencia:</span> {item.referencia ?? "Sin referencia"}</p></div>{item.nota ? <p className="mt-2 text-sm leading-7 text-slate-600">{item.nota}</p> : null}<div className="mt-4 flex flex-wrap gap-3"><button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-60" disabled={busy} onClick={() => void handlePaymentReview(item, "pagado")} title="Aprobar" type="button">✓</button><button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700 transition hover:bg-amber-200 disabled:opacity-60" disabled={busy} onClick={() => void handlePaymentReview(item, "pendiente")} title="Pendiente" type="button">!</button><button className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-xl text-rose-700 transition hover:bg-rose-200 disabled:opacity-60" disabled={busy} onClick={() => void handlePaymentReview(item, "fallido")} title="Rechazar" type="button">×</button></div></div>;
              })}
            </div>
          </article>
        </div>
      </CollapsiblePanelSection>
    </div>
  );
}