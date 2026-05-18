import { createClient } from "@supabase/supabase-js";

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno de Supabase para el procesamiento server-side.");
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
