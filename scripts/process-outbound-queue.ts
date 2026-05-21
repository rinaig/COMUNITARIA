import { createClient } from "@supabase/supabase-js";
import { processOutboundQueue } from "../src/lib/outbound-processor";

function getMissingScriptEnvNames() {
  const missing: string[] = [];
  const hasUrl = Boolean(process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasProjectId = Boolean(process.env.SUPABASE_PROJECT_ID?.trim());
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (!hasUrl && !hasProjectId) {
    missing.push("SUPABASE_URL o SUPABASE_PROJECT_ID");
  }

  if (!hasServiceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}

function getScriptEnvIssueMessage() {
  const missing = getMissingScriptEnvNames();

  if (missing.length === 0) {
    return "";
  }

  return `No se puede procesar la cola outbound por CLI. Completa estas variables: ${missing.join(", ")}.`;
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

async function main() {
  const envIssue = getScriptEnvIssueMessage();
  if (envIssue) {
    throw new Error(envIssue);
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || `https://${getRequiredEnv("SUPABASE_PROJECT_ID")}.supabase.co`;
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const limitRaw = process.env.OUTBOUND_QUEUE_LIMIT?.trim();
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;

  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error("OUTBOUND_QUEUE_LIMIT debe ser un entero positivo.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const result = await processOutboundQueue(supabase, { limit });
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
