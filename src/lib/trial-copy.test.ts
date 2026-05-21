import { describe, expect, it } from "vitest";
import { formatTrialLimits, formatTrialMessage, type AdminRegistrationResult } from "./trial-copy";

function buildResult(overrides: Partial<AdminRegistrationResult> = {}): AdminRegistrationResult {
  return {
    profile_id: "profile-1",
    consorcio_id: "tenant-1",
    codigo_invitacion: "ABC123",
    trial_expires_at: "2026-06-20T12:00:00.000Z",
    trial_unit_limit: 3,
    trial_guard_post_limit: 1,
    ...overrides,
  };
}

describe("trial copy helpers", () => {
  it("describe ambos limites cuando existen", () => {
    expect(formatTrialLimits(buildResult())).toBe("Durante la prueba podes operar hasta 3 unidades funcionales y 1 puesto de vigilancia.");
  });

  it("omite limites cuando ambos son cero o nulos", () => {
    expect(formatTrialLimits(buildResult({ trial_unit_limit: 0, trial_guard_post_limit: 0 }))).toBe("");
    expect(formatTrialLimits(buildResult({ trial_unit_limit: null, trial_guard_post_limit: null }))).toBe("");
  });

  it("arma el mensaje completo con codigo, vencimiento y limites", () => {
    expect(formatTrialMessage(buildResult())).toContain("Codigo principal del consorcio: ABC123.");
    expect(formatTrialMessage(buildResult())).toContain("Tu periodo de prueba vence el 20/6/2026.");
    expect(formatTrialMessage(buildResult())).toContain("Durante la prueba podes operar hasta 3 unidades funcionales y 1 puesto de vigilancia.");
  });

  it("arma un mensaje simple cuando no hay resultado", () => {
    expect(formatTrialMessage(null)).toBe("Alta completada. Ya podes ingresar al portal de administracion.");
  });

  it("no menciona vencimiento cuando trial_expires_at no existe", () => {
    const message = formatTrialMessage(buildResult({ codigo_invitacion: null, trial_expires_at: null, trial_guard_post_limit: 2 }));

    expect(message).toBe("Alta completada. Ya podes ingresar al portal de administracion. Durante la prueba podes operar hasta 3 unidades funcionales y 2 puestos de vigilancia.");
  });
});