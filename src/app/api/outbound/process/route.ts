import { NextRequest, NextResponse } from "next/server";
import { processOutboundQueue } from "@/lib/outbound-processor";
import {
  createServerSupabaseAdminClient,
  createServerSupabaseAuthClient,
  getMissingServerSupabaseEnvNames,
  getServerSupabaseEnvIssueMessage,
} from "@/lib/supabase-server";

type ProfileAuthRow = {
  rol: "superadmin" | "admin" | "residente" | "seguridad";
  consorcio_id: string | null;
};

function extractBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

export async function POST(request: NextRequest) {
  try {
    if (getMissingServerSupabaseEnvNames().length > 0) {
      return NextResponse.json(
        { error: getServerSupabaseEnvIssueMessage("procesar la cola saliente") },
        { status: 503 },
      );
    }

    const accessToken = extractBearerToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Falta token de sesion." }, { status: 401 });
    }

    const authClient = createServerSupabaseAuthClient(accessToken);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: authError?.message ?? "Sesion invalida." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const adminClient = createServerSupabaseAdminClient();

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("rol, consorcio_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const currentProfile = profile as ProfileAuthRow | null;
    if (!currentProfile || !["admin", "superadmin"].includes(currentProfile.rol)) {
      return NextResponse.json({ error: "No autorizado para procesar la cola." }, { status: 403 });
    }

    const result = await processOutboundQueue(adminClient, {
      consorcioId: currentProfile.rol === "superadmin" ? undefined : (currentProfile.consorcio_id ?? undefined),
      limit: body.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo procesar la cola saliente." },
      { status: 500 },
    );
  }
}
