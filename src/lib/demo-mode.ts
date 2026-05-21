import type { AppRole } from "@/lib/domain";

export type DemoRole = Exclude<AppRole, "superadmin">;

export type DemoPortalSession = {
  role: DemoRole;
  tenantName: string;
  invitationCode: string;
  activatedAt: string;
  activatedBy: string;
};

export const DEMO_PORTAL_STORAGE_KEY = "comunitaria.superuser.demo.v1";

export const demoRoles: DemoRole[] = ["admin", "residente", "seguridad"];

export function isDemoRole(value: string): value is DemoRole {
  return demoRoles.includes(value as DemoRole);
}

export function createDemoPortalSession(role: DemoRole): DemoPortalSession {
  return {
    role,
    tenantName: "Consorcio Demo Comunitaria",
    invitationCode: "DEMO-LOCAL",
    activatedAt: new Date().toISOString(),
    activatedBy: "SuperUser",
  };
}