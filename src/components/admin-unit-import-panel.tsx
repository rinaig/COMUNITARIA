"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type UnitImportRow = {
  codigo: string;
  piso: string | null;
  departamento: string | null;
  propietario_nombre: string | null;
  propietario_email: string | null;
  coeficiente: number | null;
  max_reservas_mensuales: number;
};

type ParsedRow = UnitImportRow & {
  lineNumber: number;
  issues: string[];
};

type ExistingUnit = {
  id: string;
  codigo: string;
  propietario_nombre: string | null;
  propietario_email: string | null;
};

type TenantLimit = {
  trial_unit_limit: number;
  trial_guard_post_limit: number;
};

const TEMPLATE_HEADERS = [
  "codigo",
  "piso",
  "departamento",
  "propietario_nombre",
  "propietario_email",
  "coeficiente",
  "max_reservas_mensuales",
];

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((char === "," || char === ";") && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseUnitsCsv(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [] as ParsedRow[], header: [] as string[] };
  }

  const header = parseCsvLine(lines[0]).map((item) => item.toLowerCase());
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const raw = Object.fromEntries(header.map((key, headerIndex) => [key, values[headerIndex] ?? ""]));
    const issues: string[] = [];
    const codigo = (raw.codigo ?? "").trim().toUpperCase();
    const coeficienteValue = normalizeNullable(raw.coeficiente);
    const maxReservasValue = normalizeNullable(raw.max_reservas_mensuales);

    if (!codigo) {
      issues.push("codigo obligatorio");
    }

    const coeficiente = coeficienteValue === null ? null : Number(coeficienteValue.replace(",", "."));
    if (coeficienteValue !== null && Number.isNaN(coeficiente)) {
      issues.push("coeficiente invalido");
    }

    const maxReservas = maxReservasValue === null ? 2 : Number(maxReservasValue);
    if (!Number.isInteger(maxReservas) || maxReservas <= 0) {
      issues.push("max_reservas_mensuales invalido");
    }

    return {
      lineNumber: index + 2,
      codigo,
      piso: normalizeNullable(raw.piso),
      departamento: normalizeNullable(raw.departamento),
      propietario_nombre: normalizeNullable(raw.propietario_nombre),
      propietario_email: normalizeNullable(raw.propietario_email),
      coeficiente: coeficienteValue === null || Number.isNaN(coeficiente) ? null : coeficiente,
      max_reservas_mensuales: Number.isInteger(maxReservas) && maxReservas > 0 ? maxReservas : 2,
      issues,
    } satisfies ParsedRow;
  });

  return { rows, header };
}

export function AdminUnitImportPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [existingUnits, setExistingUnits] = useState<ExistingUnit[]>([]);
  const [tenantLimit, setTenantLimit] = useState<TenantLimit | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");

  const loadUnits = useCallback(async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const consorcioId = await getCurrentConsorcioId(supabase, userId);
    const [unitsResult, tenantResult] = await Promise.all([
      supabase
        .from("unidades_funcionales")
        .select("id, codigo, propietario_nombre, propietario_email")
        .order("codigo", { ascending: true })
        .limit(25),
      supabase
        .from("consorcios")
        .select("trial_unit_limit, trial_guard_post_limit")
        .eq("id", consorcioId)
        .maybeSingle(),
    ]);

    const loadError = unitsResult.error ?? tenantResult.error;
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setExistingUnits((unitsResult.data as ExistingUnit[] | null) ?? []);
    setTenantLimit((tenantResult.data as TenantLimit | null) ?? null);
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
        await loadUnits(data.session.user.id);
      } else {
        setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [loadUnits, supabase]);

  const validRows = parsedRows.filter((row) => row.issues.length === 0);
  const invalidRows = parsedRows.filter((row) => row.issues.length > 0);
  const uniqueIncomingCodes = new Set(validRows.map((row) => row.codigo));
  const existingCodes = new Set(existingUnits.map((row) => row.codigo));
  const newCodesCount = Array.from(uniqueIncomingCodes).filter((code) => !existingCodes.has(code)).length;
  const trialLimitReached = Boolean(tenantLimit && (existingUnits.length + newCodesCount) > (tenantLimit.trial_unit_limit || 3));

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setMessage("");

    if (!file) {
      setFileName("");
      setParsedRows([]);
      return;
    }

    setFileName(file.name);
    const content = await file.text();
    const { rows, header } = parseUnitsCsv(content);

    if (rows.length === 0) {
      setParsedRows([]);
      setError("El CSV no contiene filas para importar.");
      return;
    }

    const missingHeaders = TEMPLATE_HEADERS.filter((headerName) => !header.includes(headerName));
    if (missingHeaders.length > 0) {
      setParsedRows([]);
      setError(`Faltan columnas obligatorias: ${missingHeaders.join(", ")}.`);
      return;
    }

    setParsedRows(rows);
    setMessage(`Archivo ${file.name} procesado. ${rows.length} filas detectadas.`);
  }

  async function handleImport() {
    if (!supabase || !session?.user || validRows.length === 0) {
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");

    if (trialLimitReached) {
      setError(`La prueba inicial permite hasta ${tenantLimit?.trial_unit_limit ?? 3} unidades funcionales.`);
      setImporting(false);
      return;
    }

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const payload = validRows.map((row) => ({
        consorcio_id: consorcioId,
        codigo: row.codigo,
        piso: row.piso,
        departamento: row.departamento,
        propietario_nombre: row.propietario_nombre,
        propietario_email: row.propietario_email,
        coeficiente: row.coeficiente,
        max_reservas_mensuales: row.max_reservas_mensuales,
      }));

      const { error: importError } = await supabase.from("unidades_funcionales").upsert(payload, {
        onConflict: "consorcio_id,codigo",
        ignoreDuplicates: false,
      });

      if (importError) {
        throw importError;
      }

      setMessage(`${payload.length} unidades procesadas correctamente.`);
      setParsedRows([]);
      setFileName("");
      await loadUnits(session.user.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo importar el archivo.");
    }

    setImporting(false);
  }

  async function handleExport() {
    if (!supabase) {
      return;
    }

    setExporting(true);
    setError("");

    const { data, error: exportError } = await supabase
      .from("unidades_funcionales")
      .select("codigo, piso, departamento, propietario_nombre, propietario_email, coeficiente, max_reservas_mensuales")
      .order("codigo", { ascending: true });

    if (exportError) {
      setError(exportError.message);
      setExporting(false);
      return;
    }

    const escapeValue = (value: string | number | null) => {
      const next = value === null ? "" : String(value);
      if (next.includes(",") || next.includes(";") || next.includes('"')) {
        return `"${next.replace(/"/g, '""')}"`;
      }
      return next;
    };

    const header = TEMPLATE_HEADERS.join(",");
    const rows = ((data as UnitImportRow[] | null) ?? []).map((row) => [
      row.codigo,
      row.piso,
      row.departamento,
      row.propietario_nombre,
      row.propietario_email,
      row.coeficiente,
      row.max_reservas_mensuales,
    ].map((value) => escapeValue(value ?? null)).join(","));

    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unidades-funcionales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Importacion masiva</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">CSV de unidades funcionales</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Carga o actualiza el padron base del consorcio usando upsert por codigo de unidad. Esto alimenta reservas, onboarding y datos operativos.</p>
      </div>

      {tenantLimit ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Prueba inicial activa</p><p className="mt-2 text-sm leading-7 text-emerald-700">Puedes operar hasta {tenantLimit.trial_unit_limit} unidades funcionales. Hoy tienes {existingUnits.length} cargadas.</p></article> : null}

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <article className="role-card grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Plantilla esperada</p>
              <button className="button-secondary" disabled={exporting} onClick={() => void handleExport()} type="button">{exporting ? "Exportando..." : "Exportar CSV actual"}</button>
            </div>
            <p className="text-sm leading-7 text-slate-600">Columnas requeridas: codigo, piso, departamento, propietario_nombre, propietario_email, coeficiente, max_reservas_mensuales.</p>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700">
              <p>codigo,piso,departamento,propietario_nombre,propietario_email,coeficiente,max_reservas_mensuales</p>
              <p>UF-1A,1,Ana Perez,ana@example.com,0.0125,2</p>
              <p>UF-2B,2,B,Juan Lopez,juan@example.com,0.0100,3</p>
            </div>
            <label>
              <span className="field-label">Archivo CSV</span>
              <input accept=".csv,text/csv" className="field mt-2" onChange={handleFileChange} type="file" />
            </label>
            {fileName ? <p className="text-sm leading-7 text-slate-600">Archivo cargado: {fileName}</p> : null}
            {tenantLimit ? <p className="text-sm leading-7 text-slate-600">Esta prueba acepta como maximo {tenantLimit.trial_unit_limit} unidades distintas. Nuevas unidades detectadas en esta carga: {newCodesCount}.</p> : null}
            <button className="button-primary" disabled={importing || validRows.length === 0} onClick={() => void handleImport()} type="button">{importing ? "Importando..." : `Importar ${validRows.length} filas validas`}</button>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Vista previa</p>
            <div className="mt-4 grid gap-3">
              {parsedRows.length === 0 ? <p className="text-sm leading-7 text-slate-600">Carga un CSV para revisar filas validas y observaciones.</p> : parsedRows.slice(0, 8).map((row) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={`${row.codigo}-${row.lineNumber}`}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{row.codigo || `Fila ${row.lineNumber}`}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{row.propietario_nombre ?? "Sin propietario"} · {row.propietario_email ?? "Sin email"}</p></div><span className={row.issues.length === 0 ? "status-badge status-badge--success" : "status-badge status-badge--warning"}>{row.issues.length === 0 ? "valida" : "revisar"}</span></div>{row.issues.length > 0 ? <p className="mt-3 text-sm leading-7 text-amber-700">{row.issues.join(" · ")}</p> : <p className="mt-3 text-sm leading-7 text-slate-600">Coeficiente {row.coeficiente ?? "-"} · max. mensual {row.max_reservas_mensuales}</p>}</div>)}
            </div>
          </article>
        </div>

        <div className="grid gap-6">
          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Resultado del archivo</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="metric-card">
                <span>Filas validas</span>
                <strong>{validRows.length}</strong>
                <small>Listas para upsert</small>
              </div>
              <div className="metric-card">
                <span>Filas con error</span>
                <strong>{invalidRows.length}</strong>
                <small>No se importan hasta corregirlas</small>
              </div>
            </div>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Padron actual</p>
            <div className="mt-4 grid gap-3">
              {loading ? <p className="text-sm leading-7 text-slate-600">Cargando unidades.</p> : existingUnits.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay unidades cargadas.</p> : existingUnits.map((unit) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={unit.id}><h4 className="text-lg font-semibold text-slate-950">{unit.codigo}</h4><p className="mt-2 text-sm leading-7 text-slate-600">{unit.propietario_nombre ?? "Sin propietario"}</p><p className="text-sm leading-7 text-slate-600">{unit.propietario_email ?? "Sin email"}</p></div>)}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}