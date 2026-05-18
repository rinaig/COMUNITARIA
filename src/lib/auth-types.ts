import type { AppRole } from "@/lib/domain";

export type ProfileStatus = "pendiente" | "activo" | "rechazado";

export type ProfileRecord = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  dni: string | null;
  unidad_funcional: string | null;
  es_menor: boolean;
  adulto_responsable_id: string | null;
  adulto_responsable_email: string | null;
  rol: AppRole;
  estado: ProfileStatus;
  consorcio_id: string | null;
};

export type TenantRecord = {
  id: string;
  nombre: string;
  direccion: string;
  codigo_invitacion: string;
  es_demo: boolean;
  demo_unit_limit: number;
};