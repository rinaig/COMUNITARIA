import { describe, expect, it } from "vitest";
import { getCompatIssueMessage } from "./platform-schema-compat";

describe("getCompatIssueMessage", () => {
  it("normaliza errores de parseo HTML como problema de conexion o configuracion", () => {
    const message = getCompatIssueMessage("Suscripciones", new Error("SyntaxError: Unexpected token '<', \"<!DOCTYPE ...\" is not valid JSON"));

    expect(message).toBe("Suscripciones: no se pudo refrescar temporalmente por un problema de conexion. La informacion ya cargada sigue disponible.");
  });

  it("mantiene el mensaje de compatibilidad cuando faltan objetos del schema", () => {
    const message = getCompatIssueMessage("Auditoria", new Error('relation "platform_audit_events" does not exist'));

    expect(message).toBe("Auditoria: la base remota todavia no tiene todos los objetos o columnas desplegados. Este bloque quedara completo cuando se apliquen las migraciones pendientes.");
  });
});