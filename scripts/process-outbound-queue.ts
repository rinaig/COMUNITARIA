import { createClient } from "@supabase/supabase-js";
import { processOutboundQueue } from "../src/lib/outbound-processor";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

async function main() {
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
