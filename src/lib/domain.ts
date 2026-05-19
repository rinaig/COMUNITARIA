export type AppRole = "superadmin" | "admin" | "residente" | "seguridad";

export type ReservationRecord = {
  id: string;
  consorcioId: string;
  unitId: string;
  amenityId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  residentName: string;
};

export const roleLabels: Record<AppRole, string> = {
  superadmin: "SuperUser",
  admin: "Administrador",
  residente: "Usuario",
  seguridad: "Seguridad",
};
