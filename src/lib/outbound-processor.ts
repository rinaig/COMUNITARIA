import type { SupabaseClient } from "@supabase/supabase-js";
import type { JsonObject } from "@/lib/supabase-server";

type DeliveryChannel = "email" | "whatsapp";
type DeliveryStatus = "pendiente" | "enviado" | "fallido" | "omitido";

type DeliveryRow = {
  id: string;
  consorcio_id: string;
  canal: DeliveryChannel;
  destinatario_email: string | null;
  destinatario_ref: string | null;
  asunto: string;
  cuerpo: string;
  estado: DeliveryStatus;
  proveedor: string | null;
  payload: JsonObject | null;
};

type ProcessingScope = {
  consorcioId?: string;
  limit?: number;
};

type ProcessedResult = {
  total: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
};

type IntegrationPayload = {
  proveedor?: string;
  remitente?: string;
  credenciales?: Record<string, string | null | undefined>;
  modo_prueba?: boolean;
};

function getIntegrationPayload(row: DeliveryRow): IntegrationPayload {
  const integration = row.payload && typeof row.payload.integration === "object"
    ? (row.payload.integration as IntegrationPayload)
    : null;

  return integration ?? {};
}

async function updateDelivery(
  supabase: SupabaseClient,
  rowId: string,
  estado: DeliveryStatus,
  currentPayload: JsonObject | null,
  errorMessage?: string,
  result?: JsonObject,
) {
  const timestamp = new Date().toISOString();
  const updatePayload: {
    estado: DeliveryStatus;
    processed_at: string;
    error_message?: string | null;
    payload?: JsonObject;
  } = {
    estado,
    processed_at: timestamp,
    error_message: errorMessage ?? null,
  };

  if (result) {
    updatePayload.payload = {
      ...(currentPayload ?? {}),
      result,
    };
  }

  const { error } = await supabase
    .from("notificacion_salidas")
    .update(updatePayload)
    .eq("id", rowId);

  if (error) {
    throw new Error(error.message);
  }
}

async function sendEmail(row: DeliveryRow): Promise<JsonObject> {
  const integration = getIntegrationPayload(row);
  const provider = (row.proveedor ?? integration.proveedor ?? "").toLowerCase();
  const credentials = integration.credenciales ?? {};
  const testMode = Boolean(integration.modo_prueba);

  if (testMode) {
    return { mode: "test", provider: provider || "simulado" };
  }

  if (!row.destinatario_email) {
    throw new Error("La salida de email no tiene destinatario.");
  }

  if (provider !== "resend") {
    throw new Error(`Proveedor de email no soportado para envio real: ${provider || "sin_proveedor"}.`);
  }

  const apiKey = credentials.campo3 ?? undefined;
  const from = integration.remitente ?? credentials.campo4 ?? undefined;
  const endpoint = credentials.campo1 ?? "https://api.resend.com/emails";

  if (!apiKey || !from) {
    throw new Error("Faltan credenciales de Resend: api key o remitente.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [row.destinatario_email],
      subject: row.asunto,
      text: row.cuerpo,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok) {
    throw new Error(typeof result.message === "string" ? result.message : "Fallo el proveedor de email.");
  }

  return {
    provider,
    endpoint,
    response: result,
  };
}

async function sendWhatsApp(row: DeliveryRow): Promise<JsonObject> {
  const integration = getIntegrationPayload(row);
  const provider = (row.proveedor ?? integration.proveedor ?? "").toLowerCase();
  const credentials = integration.credenciales ?? {};
  const testMode = Boolean(integration.modo_prueba);

  if (testMode) {
    return { mode: "test", provider: provider || "simulado" };
  }

  if (!row.destinatario_ref) {
    throw new Error("La salida de WhatsApp no tiene destinatario.");
  }

  if (provider !== "meta") {
    throw new Error(`Proveedor de WhatsApp no soportado para envio real: ${provider || "sin_proveedor"}.`);
  }

  const phoneNumberId = credentials.campo1 ?? undefined;
  const token = credentials.campo2 ?? undefined;
  const baseUrl = credentials.campo3 ?? "https://graph.facebook.com/v20.0";

  if (!phoneNumberId || !token) {
    throw new Error("Faltan credenciales de WhatsApp Meta: phone number id o token.");
  }

  const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: row.destinatario_ref,
      type: "text",
      text: {
        preview_url: false,
        body: `${row.asunto}\n\n${row.cuerpo}`,
      },
    }),
  });

  const result = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok) {
    throw new Error(typeof result.error === "object" && result.error && typeof (result.error as JsonObject).message === "string"
      ? String((result.error as JsonObject).message)
      : "Fallo el proveedor de WhatsApp.");
  }

  return {
    provider,
    baseUrl,
    response: result,
  };
}

async function processOneDelivery(supabase: SupabaseClient, row: DeliveryRow) {
  try {
    const result = row.canal === "email" ? await sendEmail(row) : await sendWhatsApp(row);
    await updateDelivery(supabase, row.id, "enviado", row.payload, undefined, result);
    return "enviado" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al procesar la salida.";
    const finalState = message.includes("no soportado") || message.includes("no tiene destinatario") ? "omitido" : "fallido";
    await updateDelivery(supabase, row.id, finalState, row.payload, message);
    return finalState;
  }
}

export async function processOutboundQueue(
  supabase: SupabaseClient,
  scope: ProcessingScope,
): Promise<ProcessedResult> {
  const limit = Math.min(Math.max(scope.limit ?? 10, 1), 50);

  let query = supabase
    .from("notificacion_salidas")
    .select("id, consorcio_id, canal, destinatario_email, destinatario_ref, asunto, cuerpo, estado, proveedor, payload")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (scope.consorcioId) {
    query = query.eq("consorcio_id", scope.consorcioId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data as DeliveryRow[] | null) ?? [];
  const summary: ProcessedResult = {
    total: rows.length,
    enviados: 0,
    fallidos: 0,
    omitidos: 0,
  };

  for (const row of rows) {
    const state = await processOneDelivery(supabase, row);
    if (state === "enviado") {
      summary.enviados += 1;
    } else if (state === "fallido") {
      summary.fallidos += 1;
    } else if (state === "omitido") {
      summary.omitidos += 1;
    }
  }

  return summary;
}
