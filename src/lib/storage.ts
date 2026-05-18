import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPENSE_BUCKET = "expense-comprobantes";
export const DOCUMENT_BUCKET = "consorcio-documents";
export const OPERATIONS_BUCKET = "operations-media";

export async function getCurrentConsorcioId(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("consorcio_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.consorcio_id) {
    throw new Error("El usuario no tiene consorcio asociado.");
  }

  return data.consorcio_id as string;
}

export async function uploadTenantFile(
  supabase: SupabaseClient,
  bucket: string,
  consorcioId: string,
  file: File,
  folder: string,
) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectPath = `${consorcioId}/${folder}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);

  return {
    path: objectPath,
    publicUrl: data.publicUrl,
  };
}