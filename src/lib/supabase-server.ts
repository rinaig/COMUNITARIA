import { createClient } from "@supabase/supabase-js";

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

type SupabaseEnvVariable = "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY";

function getEnvValue(name: SupabaseEnvVariable) {
  return process.env[name]?.trim() ?? "";
}

export function getMissingServerSupabaseEnvNames() {
  const missing: SupabaseEnvVariable[] = [];

  if (!getEnvValue("NEXT_PUBLIC_SUPABASE_URL")) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!getEnvValue("SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}

export function getServerSupabaseEnvIssueMessage(scopeLabel = "el procesamiento server-side") {
  const missing = getMissingServerSupabaseEnvNames();

  if (missing.length === 0) {
    return "";
  }

  return `Falta configuracion server-side de Supabase para ${scopeLabel}. Completa estas variables: ${missing.join(", ")}.`;
}

function getSupabaseEnv(): SupabaseEnv {
  const url = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(getServerSupabaseEnvIssueMessage("el procesamiento server-side"));
  }

  return { url, anonKey, serviceRoleKey };
}

export function createServerSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseEnv();

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createServerSupabaseAuthClient(accessToken: string) {
  const { url, anonKey } = getSupabaseEnv();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export type JsonObject = { [key: string]: JsonValue };
