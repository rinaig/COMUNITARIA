import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultHomeContent, normalizeHomeContent, type HomeContentConfig } from "./home-content";

export type PlatformSettingsCompatRow = {
  default_unit_price: number;
  support_email: string | null;
  support_phone: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  home_content: HomeContentConfig;
};

export type PlatformAuditEventCompatRow = {
  id: string;
  action: string;
  target_table: string;
  target_id: string | null;
  consorcio_id: string | null;
  created_at: string;
  actor_id: string | null;
};

type CompatResult<T> = {
  data: T;
  warning: string | null;
  error: string | null;
};

const PLATFORM_SETTINGS_DEFAULTS: PlatformSettingsCompatRow = {
  default_unit_price: 0,
  support_email: null,
  support_phone: null,
  instagram_url: null,
  linkedin_url: null,
  x_url: null,
  facebook_url: null,
  home_content: getDefaultHomeContent(),
};

const FULL_PLATFORM_SETTINGS_SELECT = "default_unit_price, support_email, support_phone, instagram_url, linkedin_url, x_url, facebook_url, home_content";
const WITHOUT_HOME_CONTENT_SELECT = "default_unit_price, support_email, support_phone, instagram_url, linkedin_url, x_url, facebook_url";
const LEGACY_PLATFORM_SETTINGS_SELECT = "default_unit_price, support_email, support_phone, instagram_url, x_url, facebook_url";

function getErrorMessage(error: { message?: string } | null | undefined) {
  return (error?.message ?? "").toLowerCase();
}

function getUnknownErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Error no identificado";
}

function isMissingColumnError(error: { message?: string } | null | undefined, columnName: string) {
  const message = getErrorMessage(error);
  return message.includes(columnName.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

function isMissingTableError(error: { message?: string } | null | undefined, tableName: string) {
  const message = getErrorMessage(error);
  return message.includes(tableName.toLowerCase()) && (message.includes("does not exist") || message.includes("could not find the table") || message.includes("schema cache"));
}

function isFetchFailureError(error: unknown) {
  const message = getUnknownErrorMessage(error).toLowerCase();
  return message.includes("failed to fetch")
    || message.includes("fetch failed")
    || message.includes("network")
    || message.includes("load failed")
    || message.includes("unexpected token '<'")
    || message.includes("<!doctype")
    || message.includes("is not valid json");
}

function isSchemaCompatibilityError(error: unknown) {
  const message = getUnknownErrorMessage(error).toLowerCase();
  return message.includes("does not exist") || message.includes("could not find the table") || message.includes("schema cache");
}

export function getCompatIssueMessage(scopeLabel: string, error: unknown) {
  const message = getUnknownErrorMessage(error);

  if (isFetchFailureError(error)) {
    return `${scopeLabel}: no se pudo refrescar temporalmente por un problema de conexion. La informacion ya cargada sigue disponible.`;
  }

  if (isSchemaCompatibilityError(error)) {
    return `${scopeLabel}: la base remota todavia no tiene todos los objetos o columnas desplegados. Este bloque quedara completo cuando se apliquen las migraciones pendientes.`;
  }

  return `${scopeLabel}: ${message}`;
}

function normalizePlatformSettings(data: Partial<PlatformSettingsCompatRow> | null | undefined): PlatformSettingsCompatRow {
  return {
    default_unit_price: Number(data?.default_unit_price ?? 0),
    support_email: data?.support_email ?? null,
    support_phone: data?.support_phone ?? null,
    instagram_url: data?.instagram_url ?? null,
    linkedin_url: data?.linkedin_url ?? null,
    x_url: data?.x_url ?? null,
    facebook_url: data?.facebook_url ?? null,
    home_content: normalizeHomeContent(data?.home_content),
  };
}

export async function loadPlatformSettingsCompat(supabase: SupabaseClient): Promise<CompatResult<PlatformSettingsCompatRow>> {
  const fullResult = await supabase
    .from("platform_settings")
    .select(FULL_PLATFORM_SETTINGS_SELECT)
    .eq("id", true)
    .maybeSingle();

  if (!fullResult.error) {
    return {
      data: normalizePlatformSettings(fullResult.data as Partial<PlatformSettingsCompatRow> | null),
      warning: null,
      error: null,
    };
  }

  if (isMissingColumnError(fullResult.error, "home_content")) {
    const withoutHomeContentResult = await supabase
      .from("platform_settings")
      .select(WITHOUT_HOME_CONTENT_SELECT)
      .eq("id", true)
      .maybeSingle();

    if (!withoutHomeContentResult.error) {
      return {
        data: normalizePlatformSettings(withoutHomeContentResult.data as Partial<PlatformSettingsCompatRow> | null),
        warning: "La configuracion avanzada del home quedara persistida cuando se aplique la migracion pendiente de plataforma. En esta sesion local se seguira usando la vista previa del navegador.",
        error: null,
      };
    }

    if (!isMissingColumnError(withoutHomeContentResult.error, "linkedin_url")) {
      return {
        data: PLATFORM_SETTINGS_DEFAULTS,
        warning: null,
        error: withoutHomeContentResult.error.message,
      };
    }

    const legacyAfterHomeResult = await supabase
      .from("platform_settings")
      .select(LEGACY_PLATFORM_SETTINGS_SELECT)
      .eq("id", true)
      .maybeSingle();

    if (legacyAfterHomeResult.error) {
      return {
        data: PLATFORM_SETTINGS_DEFAULTS,
        warning: null,
        error: legacyAfterHomeResult.error.message,
      };
    }

    return {
      data: normalizePlatformSettings(legacyAfterHomeResult.data as Partial<PlatformSettingsCompatRow> | null),
      warning: "La base actual todavia no tiene LinkedIn ni la configuracion avanzada del home desplegados. Email, telefono, Instagram, X y Facebook siguen operativos; la portada avanzada se mantiene como vista previa local.",
      error: null,
    };
  }

  if (!isMissingColumnError(fullResult.error, "linkedin_url")) {
    return {
      data: PLATFORM_SETTINGS_DEFAULTS,
      warning: null,
      error: fullResult.error.message,
    };
  }

  const legacyResult = await supabase
    .from("platform_settings")
    .select(LEGACY_PLATFORM_SETTINGS_SELECT)
    .eq("id", true)
    .maybeSingle();

  if (legacyResult.error) {
    return {
      data: PLATFORM_SETTINGS_DEFAULTS,
      warning: null,
      error: legacyResult.error.message,
    };
  }

  return {
    data: normalizePlatformSettings(legacyResult.data as Partial<PlatformSettingsCompatRow> | null),
    warning: "La base actual todavia no tiene LinkedIn desplegado. Email, telefono, Instagram, X y Facebook siguen operativos.",
    error: null,
  };
}

export async function savePlatformSettingsCompat(
  supabase: SupabaseClient,
  payload: PlatformSettingsCompatRow,
): Promise<{ warning: string | null; error: string | null }> {
  const fullPayload = {
    id: true,
    ...payload,
  };

  const fullResult = await supabase
    .from("platform_settings")
    .upsert(fullPayload, { onConflict: "id" });

  if (!fullResult.error) {
    return { warning: null, error: null };
  }

  if (isMissingColumnError(fullResult.error, "home_content")) {
    const { home_content: ignoredHomeContent, ...payloadWithoutHomeContent } = fullPayload;
    void ignoredHomeContent;
    const withoutHomeContentResult = await supabase
      .from("platform_settings")
      .upsert(payloadWithoutHomeContent, { onConflict: "id" });

    if (!withoutHomeContentResult.error) {
      return {
        warning: "La configuracion avanzada del home quedara persistida cuando se aplique la migracion pendiente de plataforma. En esta sesion local se conserva como vista previa del navegador.",
        error: null,
      };
    }

    if (!isMissingColumnError(withoutHomeContentResult.error, "linkedin_url")) {
      return { warning: null, error: withoutHomeContentResult.error.message };
    }

    const { linkedin_url: ignoredLinkedinAfterHome, ...legacyPayloadAfterHome } = payloadWithoutHomeContent;
    void ignoredLinkedinAfterHome;
    const legacyAfterHomeResult = await supabase
      .from("platform_settings")
      .upsert(legacyPayloadAfterHome, { onConflict: "id" });

    if (legacyAfterHomeResult.error) {
      return { warning: null, error: legacyAfterHomeResult.error.message };
    }

    return {
      warning: "Se guardaron email, telefono, Instagram, X y Facebook. LinkedIn y la configuracion avanzada del home quedaran disponibles cuando se apliquen las migraciones pendientes.",
      error: null,
    };
  }

  if (!isMissingColumnError(fullResult.error, "linkedin_url")) {
    return { warning: null, error: fullResult.error.message };
  }

  const { linkedin_url: ignoredLinkedin, ...legacyPayload } = fullPayload;
  void ignoredLinkedin;
  const legacyResult = await supabase
    .from("platform_settings")
    .upsert(legacyPayload, { onConflict: "id" });

  if (legacyResult.error) {
    return { warning: null, error: legacyResult.error.message };
  }

  return {
    warning: "Se guardaron email, telefono, Instagram, X y Facebook. LinkedIn quedara disponible cuando se aplique la migracion pendiente.",
    error: null,
  };
}

export async function loadPlatformAuditEventsCompat(
  supabase: SupabaseClient,
  limit = 10,
): Promise<CompatResult<PlatformAuditEventCompatRow[]>> {
  const result = await supabase
    .from("platform_audit_events")
    .select("id, action, target_table, target_id, consorcio_id, created_at, actor_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!result.error) {
    return {
      data: (result.data as PlatformAuditEventCompatRow[] | null) ?? [],
      warning: null,
      error: null,
    };
  }

  if (isMissingTableError(result.error, "platform_audit_events")) {
    return {
      data: [],
      warning: "La auditoria reciente aparecera cuando se aplique la migracion pendiente de plataforma.",
      error: null,
    };
  }

  return {
    data: [],
    warning: null,
    error: result.error.message,
  };
}