"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId, OPERATIONS_BUCKET, uploadTenantFile } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Provider = {
  id: string;
  nombre: string;
  empresa: string | null;
  rubro: string | null;
  telefono: string | null;
  activo: boolean;
};

type ProviderDocument = {
  id: string;
  proveedor_id: string;
  tipo: "art" | "seguro" | "habilitacion";
  requisito_id: string | null;
  nombre_documento: string | null;
  vence_el: string;
  archivo_url: string;
};

type ProviderDocumentRequirement = {
  id: string;
  nombre: string;
  codigo: string;
  requerido: boolean;
  dias_alerta: number;
};

const documentKinds: Array<ProviderDocument["tipo"]> = ["art", "seguro", "habilitacion"];

export function AdminProvidersPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [requirements, setRequirements] = useState<ProviderDocumentRequirement[]>([]);
  const [providerName, setProviderName] = useState("");
  const [providerCompany, setProviderCompany] = useState("");
  const [providerRubro, setProviderRubro] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [documentKind, setDocumentKind] = useState<ProviderDocument["tipo"]>("art");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [documentExpiresAt, setDocumentExpiresAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [savingRequirement, setSavingRequirement] = useState(false);
  const [requirementName, setRequirementName] = useState("");
  const [requirementCode, setRequirementCode] = useState("");
  const [requirementRequired, setRequirementRequired] = useState(true);
  const [requirementAlertDays, setRequirementAlertDays] = useState("30");

  const loadData = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const [providersResult, documentsResult, requirementsResult] = await Promise.all([
      supabase.from("proveedores").select("id, nombre, empresa, rubro, telefono, activo").order("nombre", { ascending: true }).limit(20),
      supabase.from("proveedor_documentos").select("id, proveedor_id, tipo, requisito_id, nombre_documento, vence_el, archivo_url").order("vence_el", { ascending: true }).limit(30),
      supabase.from("proveedor_documento_requisitos").select("id, nombre, codigo, requerido, dias_alerta").order("nombre", { ascending: true }).limit(30),
    ]);

    const firstError = [providersResult.error, documentsResult.error, requirementsResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextProviders = (providersResult.data as Provider[] | null) ?? [];
    setProviders(nextProviders);
    setDocuments((documentsResult.data as ProviderDocument[] | null) ?? []);
    const nextRequirements = (requirementsResult.data as ProviderDocumentRequirement[] | null) ?? [];
    setRequirements(nextRequirements);

    if (!selectedProviderId && nextProviders[0]) {
      setSelectedProviderId(nextProviders[0].id);
    }

    if (!selectedRequirementId && nextRequirements[0]) {
      setSelectedRequirementId(nextRequirements[0].id);
      if (documentKinds.includes(nextRequirements[0].codigo as ProviderDocument["tipo"])) {
        setDocumentKind(nextRequirements[0].codigo as ProviderDocument["tipo"]);
      }
    }

    setLoading(false);
  }, [selectedProviderId, selectedRequirementId, supabase]);

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
        await loadData();
      } else {
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadData, supabase]);

  async function handleProviderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSavingProvider(true);
    setError("");
    setMessage("");

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const { error: insertError } = await supabase.from("proveedores").insert({
        consorcio_id: consorcioId,
        nombre: providerName,
        empresa: providerCompany || null,
        rubro: providerRubro || null,
        telefono: providerPhone || null,
      });

      if (insertError) {
        throw insertError;
      }

      setProviderName("");
      setProviderCompany("");
      setProviderRubro("");
      setProviderPhone("");
      setMessage("Proveedor creado correctamente.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo crear el proveedor.");
    }

    setSavingProvider(false);
  }

  async function handleDocumentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user || !selectedProviderId || !documentFile) {
      setError("Selecciona proveedor y archivo antes de cargar el documento.");
      return;
    }

    setSavingDocument(true);
    setError("");
    setMessage("");

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const selectedRequirement = requirements.find((item) => item.id === selectedRequirementId) ?? null;
      const upload = await uploadTenantFile(supabase, OPERATIONS_BUCKET, consorcioId, documentFile, "provider-docs");
      const { error: insertError } = await supabase.from("proveedor_documentos").insert({
        consorcio_id: consorcioId,
        proveedor_id: selectedProviderId,
        tipo: documentKind,
        requisito_id: selectedRequirementId || null,
        nombre_documento: selectedRequirement?.nombre ?? null,
        vence_el: documentExpiresAt,
        archivo_url: upload.publicUrl,
      });

      if (insertError) {
        throw insertError;
      }

      setDocumentKind("art");
      setDocumentExpiresAt(new Date().toISOString().slice(0, 10));
      setDocumentFile(null);
      setMessage("Documento del proveedor cargado correctamente.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo cargar el documento.");
    }

    setSavingDocument(false);
  }

  async function handleRequirementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session?.user) {
      return;
    }

    setSavingRequirement(true);
    setError("");
    setMessage("");

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const nextCode = requirementCode.trim().toLowerCase() || requirementName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const { error: insertError } = await supabase.from("proveedor_documento_requisitos").upsert({
        consorcio_id: consorcioId,
        nombre: requirementName.trim(),
        codigo: nextCode,
        requerido: requirementRequired,
        dias_alerta: Number(requirementAlertDays || 0),
      }, {
        onConflict: "consorcio_id,codigo",
        ignoreDuplicates: false,
      });

      if (insertError) {
        throw insertError;
      }

      setRequirementName("");
      setRequirementCode("");
      setRequirementRequired(true);
      setRequirementAlertDays("30");
      setMessage("Requisito documental guardado correctamente.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar el requisito documental.");
    }

    setSavingRequirement(false);
  }

  const documentsByProvider = documents.reduce<Record<string, ProviderDocument[]>>((acc, item) => {
    acc[item.proveedor_id] ??= [];
    acc[item.proveedor_id].push(item);
    return acc;
  }, {});

  const selectedRequirement = requirements.find((item) => item.id === selectedRequirementId) ?? null;

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Proveedores reales</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Alta operativa y control documental</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Administracion puede crear proveedores y subir ART, seguro o habilitacion para que seguridad los controle en tiempo real.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-6">
          <form className="role-card grid gap-4" onSubmit={handleProviderSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Alta de proveedor</p>
            <label><span className="field-label">Nombre</span><input className="field mt-2" onChange={(event) => setProviderName(event.target.value)} required value={providerName} /></label>
            <label><span className="field-label">Empresa</span><input className="field mt-2" onChange={(event) => setProviderCompany(event.target.value)} value={providerCompany} /></label>
            <label><span className="field-label">Rubro</span><input className="field mt-2" onChange={(event) => setProviderRubro(event.target.value)} value={providerRubro} /></label>
            <label><span className="field-label">Telefono</span><input className="field mt-2" onChange={(event) => setProviderPhone(event.target.value)} value={providerPhone} /></label>
            <button className="button-primary" disabled={savingProvider || loading} type="submit">{savingProvider ? "Guardando..." : "Crear proveedor"}</button>
          </form>

          <form className="role-card grid gap-4" onSubmit={handleRequirementSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Requisitos documentales</p>
            <label><span className="field-label">Nombre visible</span><input className="field mt-2" onChange={(event) => setRequirementName(event.target.value)} required value={requirementName} /></label>
            <label><span className="field-label">Codigo interno</span><input className="field mt-2" onChange={(event) => setRequirementCode(event.target.value)} placeholder="ej: monotributo, apto_altura" value={requirementCode} /></label>
            <label><span className="field-label">Dias de alerta</span><input className="field mt-2" min="0" onChange={(event) => setRequirementAlertDays(event.target.value)} required type="number" value={requirementAlertDays} /></label>
            <label className="flex items-center gap-3 text-sm text-slate-700"><input checked={requirementRequired} onChange={(event) => setRequirementRequired(event.target.checked)} type="checkbox" /> Requerido u obligatorio para habilitar ingreso</label>
            <button className="button-primary" disabled={savingRequirement || loading} type="submit">{savingRequirement ? "Guardando..." : "Guardar requisito"}</button>
          </form>

          <form className="role-card grid gap-4" onSubmit={handleDocumentSubmit}>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Cargar documento</p>
            <label><span className="field-label">Proveedor</span><select className="field-select mt-2" onChange={(event) => setSelectedProviderId(event.target.value)} value={selectedProviderId}>{providers.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
            <label><span className="field-label">Requisito</span><select className="field-select mt-2" onChange={(event) => { const nextId = event.target.value; setSelectedRequirementId(nextId); const nextRequirement = requirements.find((item) => item.id === nextId); if (nextRequirement && documentKinds.includes(nextRequirement.codigo as ProviderDocument["tipo"])) { setDocumentKind(nextRequirement.codigo as ProviderDocument["tipo"]); } }} value={selectedRequirementId}>{requirements.map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.requerido ? " · obligatorio" : " · opcional"}</option>)}</select></label>
            <label><span className="field-label">Tipo base</span><select className="field-select mt-2" onChange={(event) => setDocumentKind(event.target.value as ProviderDocument["tipo"])} value={documentKind}>{documentKinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span className="field-label">Vence el</span><input className="field mt-2" onChange={(event) => setDocumentExpiresAt(event.target.value)} required type="date" value={documentExpiresAt} /></label>
            <label><span className="field-label">Archivo</span><input className="field mt-2" accept=".pdf,image/*" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required type="file" /></label>
            {selectedRequirement ? <p className="text-sm leading-7 text-slate-600">Se cargara como {selectedRequirement.nombre} {selectedRequirement.requerido ? "obligatorio" : "opcional"} con alerta {selectedRequirement.dias_alerta} dias antes del vencimiento.</p> : null}
            <button className="button-primary" disabled={savingDocument || loading} type="submit">{savingDocument ? "Subiendo..." : "Subir documento"}</button>
          </form>
        </div>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Padron operativo</p>
          <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">{requirements.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay requisitos documentales configurados.</p> : requirements.map((item) => <div className="flex items-center justify-between gap-3" key={item.id}><div><p className="text-sm font-semibold text-slate-950">{item.nombre}</p><p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.codigo} · alerta {item.dias_alerta} dias</p></div><span className={item.requerido ? "status-badge status-badge--warning" : "status-badge status-badge--neutral"}>{item.requerido ? "obligatorio" : "opcional"}</span></div>)}</div>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando proveedores.</p> : providers.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay proveedores cargados.</p> : providers.map((item) => { const providerDocs = documentsByProvider[item.id] ?? []; const docsByRequirement = new Map(providerDocs.map((doc) => [doc.requisito_id ?? doc.tipo, doc])); return <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{item.nombre}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{item.empresa ?? "Sin empresa"}</p></div><span className="status-badge status-badge--neutral">{item.activo ? "activo" : "inactivo"}</span></div><div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{item.rubro ?? "sin rubro"}</span><span>{item.telefono ?? "sin telefono"}</span></div><div className="mt-4 grid gap-2">{requirements.length === 0 ? <p className="text-sm leading-7 text-slate-600">Sin requisitos configurados.</p> : requirements.map((requirement) => { const doc = docsByRequirement.get(requirement.id) ?? docsByRequirement.get(requirement.codigo); return <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3" key={`${item.id}-${requirement.id}`}><div><p className="text-sm font-semibold text-slate-900">{requirement.nombre}</p><p className="text-xs uppercase tracking-[0.18em] text-slate-400">{doc ? `Vence ${new Date(doc.vence_el).toLocaleDateString("es-AR")}` : requirement.requerido ? "faltante obligatorio" : "sin carga"}</p></div><div className="flex items-center gap-3">{requirement.requerido ? <span className="status-badge status-badge--warning">obligatorio</span> : <span className="status-badge status-badge--neutral">opcional</span>}{doc ? <a className="button-secondary" href={doc.archivo_url} rel="noreferrer" target="_blank">Abrir</a> : null}</div></div>; })}</div></div>; })}
          </div>
        </article>
      </div>
    </section>
  );
}