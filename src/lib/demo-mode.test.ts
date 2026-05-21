import { describe, expect, it } from "vitest";
import { createDemoPortalSession, isDemoRole } from "./demo-mode";

describe("demo mode helpers", () => {
  it("reconoce solo los roles demo habilitados", () => {
    expect(isDemoRole("admin")).toBe(true);
    expect(isDemoRole("residente")).toBe(true);
    expect(isDemoRole("seguridad")).toBe(true);
    expect(isDemoRole("superadmin")).toBe(false);
    expect(isDemoRole("otro")).toBe(false);
  });

  it("crea una sesion local consistente para el rol pedido", () => {
    const session = createDemoPortalSession("admin");

    expect(session.role).toBe("admin");
    expect(session.tenantName).toBe("Consorcio Demo Comunitaria");
    expect(session.invitationCode).toBe("DEMO-LOCAL");
    expect(session.activatedBy).toBe("SuperUser");
    expect(Number.isNaN(new Date(session.activatedAt).getTime())).toBe(false);
  });
});