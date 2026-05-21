import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPENSE_BUCKET = "expense-comprobantes";
export const DOCUMENT_BUCKET = "consorcio-documents";
export const OPERATIONS_BUCKET = "operations-media";
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_WIDTH = 1200;

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function changeFileExtension(filename: string, nextExtension: string) {
  const baseName = filename.replace(/\.[^.]+$/, "");
  return `${baseName}.${nextExtension}`;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen seleccionada."));
    };

    image.src = objectUrl;
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("No se pudo convertir la imagen al formato WebP."));
        return;
      }

      resolve(blob);
    }, "image/webp", quality);
  });
}

async function optimizeImageForUpload(file: File) {
  if (!isImageFile(file)) {
    return file;
  }

  const { width, height } = await readImageDimensions(file);
  const scale = width > MAX_IMAGE_UPLOAD_WIDTH ? MAX_IMAGE_UPLOAD_WIDTH / width : 1;
  let targetWidth = Math.max(1, Math.round(width * scale));
  let targetHeight = Math.max(1, Math.round(height * scale));

  const bitmap = await createImageBitmap(file);

  try {
    for (const quality of [0.82, 0.74, 0.66, 0.58]) {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("No se pudo preparar la compresion de la imagen.");
      }

      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      const blob = await canvasToWebpBlob(canvas, quality);

      if (blob.size <= MAX_IMAGE_UPLOAD_BYTES || quality === 0.58) {
        if (blob.size > MAX_IMAGE_UPLOAD_BYTES) {
          throw new Error("La imagen sigue superando 3 MB incluso despues de comprimirla. Usa una imagen mas liviana.");
        }

        return new File([blob], changeFileExtension(file.name, "webp"), {
          type: "image/webp",
          lastModified: file.lastModified,
        });
      }

      targetWidth = Math.max(640, Math.round(targetWidth * 0.88));
      targetHeight = Math.max(360, Math.round((targetWidth / width) * height));
    }
  } finally {
    bitmap.close();
  }

  throw new Error("No se pudo optimizar la imagen seleccionada.");
}

export async function prepareUploadFile(file: File) {
  if (!isImageFile(file)) {
    return file;
  }

  return optimizeImageForUpload(file);
}

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
  const nextFile = await prepareUploadFile(file);
  const safeName = nextFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectPath = `${consorcioId}/${folder}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(bucket).upload(objectPath, nextFile, {
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