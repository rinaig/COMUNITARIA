"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentConsorcioId } from "@/lib/storage";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type AccessRole = "residente" | "admin" | "seguridad";

type AccessRosterRow = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  dni: string | null;
  unidad_funcional: string | null;
  puesto_vigilancia: string | null;
  es_menor: boolean;
  adulto_responsable_email: string | null;
};

type ParsedAccessRow = AccessRosterRow & {
  lineNumber: number;
  issues: string[];
};

type ExistingAccessRow = AccessRosterRow & {
  id: string;
  rol_objetivo: AccessRole;
  codigo_acceso: string | null;
  codigo_acceso_expires_at: string | null;
  is_codigo_expirado: boolean;
  estado_reclamo: "no_reclamado" | "pendiente" | "activo" | "rechazado";
};

const ACCESS_HEADERS = ["nombre", "apellido", "email", "telefono", "dni", "unidad_funcional", "puesto_vigilancia"];
const OPTIONAL_ACCESS_HEADERS = ["es_menor", "adulto_responsable_email"];

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

function normalizeBoolean(value: string | undefined) {
  return ["1", "si", "sí", "true", "x", "menor"].includes((value ?? "").trim().toLowerCase());
}

function parseAccessCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { rows: [] as ParsedAccessRow[], header: [] as string[] };
  }

  const header = parseCsvLine(lines[0]).map((item) => item.toLowerCase());
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const raw = Object.fromEntries(header.map((key, headerIndex) => [key, values[headerIndex] ?? ""]));
    const issues: string[] = [];
    const email = (raw.email ?? "").trim().toLowerCase();
    const nombre = (raw.nombre ?? "").trim();
    const apellido = (raw.apellido ?? "").trim();

    if (!nombre) {
      issues.push("nombre obligatorio");
    }
    if (!apellido) {
      issues.push("apellido obligatorio");
    }
    if (!email || !email.includes("@")) {
      issues.push("email invalido");
    }

    return {
      lineNumber: index + 2,
      nombre,
      apellido,
      email,
      telefono: normalizeNullable(raw.telefono),
      dni: normalizeNullable(raw.dni),
      unidad_funcional: normalizeNullable(raw.unidad_funcional)?.toUpperCase() ?? null,
      puesto_vigilancia: normalizeNullable(raw.puesto_vigilancia),
      es_menor: normalizeBoolean(raw.es_menor),
      adulto_responsable_email: normalizeNullable(raw.adulto_responsable_email)?.toLowerCase() ?? null,
      issues,
    } satisfies ParsedAccessRow;
  });

  return { rows, header };
}

function downloadCsv(fileName: string, header: string[], rows: Array<Record<string, string | null>>) {
  const escapeValue = (value: string | null) => {
    const next = value ?? "";
    if (next.includes(",") || next.includes(";") || next.includes('"')) {
      return `"${next.replace(/"/g, '""')}"`;
    }
    return next;
  };

  const content = [header.join(","), ...rows.map((row) => header.map((key) => escapeValue(row[key] ?? null)).join(","))].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminAccessRosterImportPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshingInviteId, setRefreshingInviteId] = useState<string | null>(null);
  const [roleMode, setRoleMode] = useState<AccessRole>("residente");
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedAccessRow[]>([]);
  const [existingRows, setExistingRows] = useState<ExistingAccessRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRoster = useCallback(async (role: AccessRole, userId: string) => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const consorcioId = await getCurrentConsorcioId(supabase, userId);
    const { data, error: loadError } = await supabase
      .from("padron_accesos_importados")
      .select("id, rol_objetivo, nombre, apellido, email, telefono, dni, unidad_funcional, puesto_vigilancia, es_menor, adulto_responsable_email, codigo_acceso, codigo_acceso_expires_at")
      .eq("consorcio_id", consorcioId)
      .eq("rol_objetivo", role)
      .order("apellido", { ascending: true })
      .order("nombre", { ascending: true })
      .limit(30);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const rosterRows = (data as Omit<ExistingAccessRow, "estado_reclamo">[] | null) ?? [];
    const rosterEmails = rosterRows.map((row) => row.email.toLowerCase());

    if (rosterEmails.length === 0) {
      setExistingRows([]);
      setLoading(false);
      return;
    }

    const { data: claimedProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email, estado")
      .eq("consorcio_id", consorcioId)
      .eq("rol", role)
      .in("email", rosterEmails);

    if (profilesError) {
      setError(profilesError.message);
      setLoading(false);
      return;
    }

    const claimStateByEmail = new Map(
      ((claimedProfiles as Array<{ email: string; estado: "pendiente" | "activo" | "rechazado" }> | null) ?? []).map((row) => [row.email.toLowerCase(), row.estado]),
    );

    const currentTime = Date.now();

    setExistingRows(
      rosterRows.map((row) => ({
        ...row,
        is_codigo_expirado: row.codigo_acceso_expires_at ? new Date(row.codigo_acceso_expires_at).getTime() < currentTime : false,
        estado_reclamo: claimStateByEmail.get(row.email.toLowerCase()) === "activo"
          ? "activo"
          : claimStateByEmail.get(row.email.toLowerCase()) === "rechazado"
            ? "rechazado"
          : claimStateByEmail.get(row.email.toLowerCase()) === "pendiente"
            ? "pendiente"
            : "no_reclamado",
      })),
    );
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
        await loadRoster(roleMode, data.session.user.id);
      } else {
        setLoading(false);
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [loadRoster, roleMode, supabase]);

  const validRows = parsedRows.filter((row) => row.issues.length === 0);

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
    const { rows, header } = parseAccessCsv(content);

    const missingHeaders = ACCESS_HEADERS.filter((headerName) => !header.includes(headerName));
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

    try {
      const consorcioId = await getCurrentConsorcioId(supabase, session.user.id);
      const payload = validRows.map((row) => ({
        consorcio_id: consorcioId,
        rol_objetivo: roleMode,
        nombre: row.nombre,
        apellido: row.apellido,
        email: row.email,
        telefono: row.telefono,
        dni: row.dni,
        unidad_funcional: roleMode === "residente" ? row.unidad_funcional : null,
        puesto_vigilancia: roleMode === "seguridad" ? row.puesto_vigilancia : null,
        es_menor: roleMode === "residente" ? row.es_menor : false,
        adulto_responsable_email: roleMode === "residente" ? row.adulto_responsable_email : null,
        origen: "csv",
      }));

      const { error: importError } = await supabase.from("padron_accesos_importados").upsert(payload, {
        onConflict: "consorcio_id,rol_objetivo,email",
        ignoreDuplicates: false,
      });

      if (importError) {
        throw importError;
      }

      setMessage(`${payload.length} registros de ${roleMode === "residente" ? "usuarios" : roleMode === "seguridad" ? "seguridad" : "administradores"} procesados.`);
      setParsedRows([]);
      setFileName("");
      await loadRoster(roleMode, session.user.id);
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
      .from("padron_accesos_importados")
      .select("nombre, apellido, email, telefono, dni, unidad_funcional, puesto_vigilancia, es_menor, adulto_responsable_email")
      .eq("rol_objetivo", roleMode)
      .order("apellido", { ascending: true })
      .order("nombre", { ascending: true });

    if (exportError) {
      setError(exportError.message);
      setExporting(false);
      return;
    }

    downloadCsv(
      `padron-${roleMode}-${new Date().toISOString().slice(0, 10)}.csv`,
      [...ACCESS_HEADERS, ...OPTIONAL_ACCESS_HEADERS],
      ((data as AccessRosterRow[] | null) ?? []).map((row) => ({
        nombre: row.nombre,
        apellido: row.apellido,
        email: row.email,
        telefono: row.telefono,
        dni: row.dni,
        unidad_funcional: row.unidad_funcional,
        puesto_vigilancia: row.puesto_vigilancia,
        es_menor: row.es_menor ? "si" : "",
        adulto_responsable_email: row.adulto_responsable_email,
      })),
    );

    setExporting(false);
  }

  function buildInviteUrl(row: ExistingAccessRow) {
    if (typeof window === "undefined" || !row.codigo_acceso) {
      return "";
    }

    const url = new URL("/auth", window.location.origin);
    url.searchParams.set("codigo", row.codigo_acceso);
    url.searchParams.set("tipo", row.rol_objetivo);
    url.searchParams.set("email", row.email);

    if (row.rol_objetivo === "residente" && row.unidad_funcional) {
      url.searchParams.set("unidad", row.unidad_funcional);
    }

    return url.toString();
  }

  async function handleCopyInvite(row: ExistingAccessRow) {
    const inviteUrl = buildInviteUrl(row);
    if (!inviteUrl) {
      setError("Todavia no se pudo generar el enlace de invitacion.");
      return;
    }

    await navigator.clipboard.writeText(inviteUrl);
    setMessage(`Invitacion copiada para ${row.email}.`);
  }

  async function handleShareInvite(row: ExistingAccessRow) {
    const inviteUrl = buildInviteUrl(row);
    if (!inviteUrl) {
      setError("Todavia no se pudo generar el enlace de invitacion.");
      return;
    }

    const shareMessage = `Hola ${row.nombre}, este es tu enlace para completar el alta en Comunitaria: ${inviteUrl}`;

    if (navigator.share) {
      await navigator.share({
        title: "Invitacion Comunitaria",
        text: shareMessage,
        url: inviteUrl,
      });
      setMessage(`Invitacion compartida para ${row.email}.`);
      return;
    }

    await handleCopyInvite(row);
  }

  async function handleRefreshInvite(row: ExistingAccessRow) {
    if (!supabase || !session?.user) {
      return;
    }

    setRefreshingInviteId(row.id);
    setError("");
    setMessage("");

    const { error: refreshError } = await supabase.rpc("refresh_roster_access_code", {
      p_roster_id: row.id,
    });

    if (refreshError) {
      setError(refreshError.message);
      setRefreshingInviteId(null);
      return;
    }

    setMessage(`Codigo regenerado para ${row.email}.`);
    await loadRoster(roleMode, session.user.id);
    setRefreshingInviteId(null);
  }

  function getClaimStatusLabel(status: ExistingAccessRow["estado_reclamo"]) {
    if (status === "activo") {
      return "activo";
    }

    if (status === "rechazado") {
      return "rechazado";
    }

    if (status === "pendiente") {
      return "pendiente";
    }

    return "no reclamado";
  }

  function getClaimStatusClass(status: ExistingAccessRow["estado_reclamo"]) {
    if (status === "activo") {
      return "status-badge status-badge--success";
    }

    if (status === "rechazado") {
      return "rounded-full bg-rose-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-rose-700";
    }

    if (status === "pendiente") {
      return "status-badge status-badge--warning";
    }

    return "status-badge status-badge--neutral";
  }

  const statusSummary = existingRows.reduce(
    (accumulator, row) => {
      accumulator[row.estado_reclamo] += 1;
      return accumulator;
    },
    { no_reclamado: 0, pendiente: 0, activo: 0, rechazado: 0 },
  );

  if (!configured || !session?.user) {
    return null;
  }

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Padron de accesos</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">CSV de usuarios, administradores y seguridad</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-600">Este padron no crea usuarios auth: prepara invitaciones individuales con codigo propio para cada alta futura.</p>
      </div>

      {error ? <article className="role-card mt-6 border-amber-200 bg-amber-50/80"><p className="text-sm font-semibold text-amber-700">Error</p><p className="mt-2 text-sm leading-7 text-amber-700">{error}</p></article> : null}
      {message ? <article className="role-card mt-6 border-emerald-200 bg-emerald-50/80"><p className="text-sm font-semibold text-emerald-700">Estado</p><p className="mt-2 text-sm leading-7 text-emerald-700">{message}</p></article> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button className={roleMode === "residente" ? "button-primary" : "button-secondary"} onClick={() => setRoleMode("residente")} type="button">Residentes</button>
        <button className={roleMode === "admin" ? "button-primary" : "button-secondary"} onClick={() => setRoleMode("admin")} type="button">Administradores</button>
        <button className={roleMode === "seguridad" ? "button-primary" : "button-secondary"} onClick={() => setRoleMode("seguridad")} type="button">Seguridad</button>
        <button className="button-secondary" disabled={exporting} onClick={() => void handleExport()} type="button">{exporting ? "Exportando..." : "Exportar CSV actual"}</button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="metric-card"><p className="text-sm uppercase tracking-[0.18em] text-slate-500">No reclamado</p><p className="mt-3 text-3xl font-semibold text-slate-950">{statusSummary.no_reclamado}</p></article>
        <article className="metric-card"><p className="text-sm uppercase tracking-[0.18em] text-slate-500">Pendiente</p><p className="mt-3 text-3xl font-semibold text-slate-950">{statusSummary.pendiente}</p></article>
        <article className="metric-card"><p className="text-sm uppercase tracking-[0.18em] text-slate-500">Activo</p><p className="mt-3 text-3xl font-semibold text-slate-950">{statusSummary.activo}</p></article>
        <article className="metric-card"><p className="text-sm uppercase tracking-[0.18em] text-slate-500">Rechazado</p><p className="mt-3 text-3xl font-semibold text-slate-950">{statusSummary.rechazado}</p></article>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <article className="role-card grid gap-4">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Plantilla esperada</p>
            <p className="text-sm leading-7 text-slate-600">Columnas base: nombre, apellido, email, telefono, dni, unidad_funcional, puesto_vigilancia. Opcionales para residentes: es_menor, adulto_responsable_email.</p>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700">
              <p>nombre,apellido,email,telefono,dni,unidad_funcional,puesto_vigilancia,es_menor,adulto_responsable_email</p>
              <p>Ana,Perez,ana@example.com,11223344,30111222,UF-1A,,,</p>
              <p>Mario,Gomez,seguridad@example.com,11223344,28111222,,Acceso Norte,,</p>
            </div>
            <label>
              <span className="field-label">Archivo CSV</span>
              <input accept=".csv,text/csv" className="field mt-2" onChange={handleFileChange} type="file" />
            </label>
            {fileName ? <p className="text-sm leading-7 text-slate-600">Archivo cargado: {fileName}</p> : null}
            <button className="button-primary" disabled={importing || validRows.length === 0} onClick={() => void handleImport()} type="button">{importing ? "Importando..." : `Importar ${validRows.length} filas validas`}</button>
          </article>

          <article className="role-card">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Vista previa</p>
            <div className="mt-4 grid gap-3">
              {parsedRows.length === 0 ? <p className="text-sm leading-7 text-slate-600">Carga un CSV para revisar el padron antes de grabar.</p> : parsedRows.slice(0, 8).map((row) => <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={`${row.email}-${row.lineNumber}`}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{row.nombre} {row.apellido}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{row.email}</p></div><span className={row.issues.length === 0 ? "status-badge status-badge--success" : "status-badge status-badge--warning"}>{row.issues.length === 0 ? "valida" : "revisar"}</span></div>{row.issues.length > 0 ? <p className="mt-3 text-sm leading-7 text-amber-700">{row.issues.join(" · ")}</p> : <p className="mt-3 text-sm leading-7 text-slate-600">Unidad {row.unidad_funcional ?? "-"} · Puesto {row.puesto_vigilancia ?? "-"} · DNI {row.dni ?? "-"}{row.es_menor ? ` · menor a cargo de ${row.adulto_responsable_email ?? "sin adulto"}` : ""}</p>}</div>)}
            </div>
          </article>
        </div>

        <article className="role-card">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Padron importado</p>
          <div className="mt-4 grid gap-3">
            {loading ? <p className="text-sm leading-7 text-slate-600">Cargando padron.</p> : existingRows.length === 0 ? <p className="text-sm leading-7 text-slate-600">Todavia no hay registros importados para este rol.</p> : existingRows.map((row) => {
              const inviteBusy = refreshingInviteId === row.id;

              return <div className="rounded-2xl border border-slate-200 bg-white/80 p-4" key={row.id}><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-semibold text-slate-950">{row.nombre} {row.apellido}</h4><p className="mt-1 text-sm leading-7 text-slate-600">{row.email}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><span className="status-badge status-badge--neutral">{row.rol_objetivo}</span>{row.es_menor ? <span className="status-badge status-badge--warning">menor</span> : null}<span className={getClaimStatusClass(row.estado_reclamo)}>{getClaimStatusLabel(row.estado_reclamo)}</span>{row.is_codigo_expirado ? <span className="status-badge status-badge--warning">codigo vencido</span> : null}</div></div><div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400"><span>{row.telefono ?? "sin telefono"}</span><span>{row.dni ?? "sin dni"}</span><span>{row.unidad_funcional ?? row.puesto_vigilancia ?? "sin referencia"}</span>{row.codigo_acceso ? <span>codigo {row.codigo_acceso}</span> : null}{row.adulto_responsable_email ? <span>adulto {row.adulto_responsable_email}</span> : null}</div><div className="mt-4 text-sm leading-7 text-slate-600">{row.codigo_acceso_expires_at ? `Vence ${new Date(row.codigo_acceso_expires_at).toLocaleString()}` : "Sin vencimiento informado"}</div>{row.estado_reclamo === "rechazado" ? <p className="mt-3 text-sm leading-7 text-rose-700">La invitacion ya fue reclamada pero el acceso del perfil quedo rechazado. Puedes regenerar el codigo para relanzar el alta cuando corresponda.</p> : null}<div className="mt-4 flex flex-wrap gap-3"><button className="button-secondary" onClick={() => void handleCopyInvite(row)} type="button">Copiar invitacion</button><button className="button-secondary" disabled={inviteBusy} onClick={() => void handleShareInvite(row)} type="button">Compartir</button><button className="button-secondary" disabled={inviteBusy} onClick={() => void handleRefreshInvite(row)} type="button">{inviteBusy ? "Regenerando..." : row.estado_reclamo === "rechazado" ? "Reemitir invitacion" : "Regenerar codigo"}</button><a className="button-secondary" href={`mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent("Invitacion Comunitaria")}&body=${encodeURIComponent(`Hola ${row.nombre}, este es tu enlace para completar el alta en Comunitaria: ${buildInviteUrl(row)}`)}`}>Email</a></div></div>;
            })}
          </div>
        </article>
      </div>
    </section>
  );
}