"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { DOCUMENT_BUCKET, getCurrentConsorcioId, uploadTenantFile } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type DocumentRow = {
  id: string;
  titulo: string;
  tipo: string;
  archivo_url: string;
  periodo_referencia: string | null;
  enlace_pago: string | null;
  publicado_at: string;
  visible_para_residentes: boolean;
};

const documentKinds = ["reglamento", "estatuto", "liquidacion", "acta", "aviso"] as const;

export function AdminDocumentsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof documentKinds)[number]>("reglamento");
  const [referencePeriod, setReferencePeriod] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("documentos_consorcio")
      .select("id, titulo, tipo, archivo_url, periodo_referencia, enlace_pago, publicado_at, visible_para_residentes")
      .order("publicado_at", { ascending: false })
      .limit(6);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setRows((data as DocumentRow[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

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
        await loadDocuments();
      } else {
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadDocuments, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    if (!documentFile) {
      setError("Debes seleccionar un archivo.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    let publicUrl = "";

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const upload = await uploadTenantFile(
        supabase,
        DOCUMENT_BUCKET,
        consorcioId,
        documentFile,
        "documents",
      );
      publicUrl = upload.publicUrl;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el documento.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("documentos_consorcio").insert({
      titulo: title,
      tipo: kind,
      archivo_url: publicUrl,
      periodo_referencia: referencePeriod || null,
      enlace_pago: kind === "liquidacion" ? paymentLink || null : null,
      visible_para_residentes: isVisible,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setTitle("");
    setKind("reglamento");
    setReferencePeriod("");
    setPaymentLink("");
    setIsVisible(true);
    setDocumentFile(null);
    setMessage("Documento cargado correctamente.");
    await loadDocuments();
    setSaving(false);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Documentacion</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Subida real de reglamentos, estatutos y liquidaciones</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Los archivos se suben a Storage y luego quedan listados en la tabla de documentos del consorcio.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form className="role-card grid gap-4" onSubmit={handleSubmit}>
          <label><span className="field-label">Titulo</span><input className="field mt-2" onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          <label><span className="field-label">Tipo</span><select className="field-select mt-2" onChange={(event) => setKind(event.target.value as (typeof documentKinds)[number])} value={kind}>{documentKinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="field-label">Periodo de referencia</span><input className="field mt-2" onChange={(event) => setReferencePeriod(event.target.value)} placeholder="Ej: Abril 2026" value={referencePeriod} /></label>
          {kind === "liquidacion" ? <label><span className="field-label">Enlace o instruccion de pago</span><input className="field mt-2" onChange={(event) => setPaymentLink(event.target.value)} placeholder="https://..., alias o CBU" value={paymentLink} /></label> : null}
          <label><span className="field-label">Archivo</span><input className="field mt-2" accept=".pdf,image/*" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required type="file" /></label>
          <label className="flex items-center gap-3 text-sm text-slate-700"><input checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} type="checkbox" /> Visible para residentes</label>
          <button className="button-primary" disabled={saving || loading} type="submit">{saving ? "Subiendo..." : "Publicar documento"}</button>
        </form>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Documentos recientes</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando documentos.</p> : rows.length === 0 ? <p className="text-sm leading-7 text-slate-600">No hay documentos cargados todavia.</p> : rows.map((item) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><h4 className="text-lg font-semibold text-slate-950">{item.titulo}</h4><span className="status-badge status-badge--neutral">{item.tipo}</span></div>{item.periodo_referencia ? <p className="mt-2 text-sm leading-7 text-slate-600">Periodo {item.periodo_referencia}</p> : null}{item.enlace_pago ? <p className="mt-1 text-sm leading-7 text-slate-600">Pago {item.enlace_pago}</p> : null}<div className="mt-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{new Date(item.publicado_at).toLocaleDateString("es-AR")}</span><a href={item.archivo_url} rel="noreferrer" target="_blank">Abrir</a></div></div>)}
          </div>
        </article>
      </div>
    </section>
  );
}