export type AdminRegistrationResult = {
  profile_id: string;
  consorcio_id: string;
  codigo_invitacion: string | null;
  trial_expires_at: string | null;
  trial_unit_limit: number | null;
  trial_guard_post_limit: number | null;
};

export function formatTrialLimits(result: AdminRegistrationResult) {
  const unitLimit = result.trial_unit_limit ?? 0;
  const guardPostLimit = result.trial_guard_post_limit ?? 0;
  const parts: string[] = [];

  if (unitLimit > 0) {
    parts.push(`${unitLimit} ${unitLimit === 1 ? "unidad funcional" : "unidades funcionales"}`);
  }

  if (guardPostLimit > 0) {
    parts.push(`${guardPostLimit} ${guardPostLimit === 1 ? "puesto de vigilancia" : "puestos de vigilancia"}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `Durante la prueba podes operar hasta ${parts.join(" y ")}.`;
}

export function formatTrialMessage(result: AdminRegistrationResult | null) {
  if (!result) {
    return "Alta completada. Ya podes ingresar al portal de administracion.";
  }

  const invitationCodeMessage = result.codigo_invitacion
    ? `Codigo principal del consorcio: ${result.codigo_invitacion}. `
    : "";
  const trialLimitsMessage = formatTrialLimits(result);
  const trialLimitsSuffix = trialLimitsMessage ? ` ${trialLimitsMessage}` : "";

  if (!result.trial_expires_at) {
    return `Alta completada. ${invitationCodeMessage}Ya podes ingresar al portal de administracion.${trialLimitsSuffix}`;
  }

  return `Alta completada. ${invitationCodeMessage}Tu periodo de prueba vence el ${new Date(result.trial_expires_at).toLocaleDateString("es-AR")}.${trialLimitsSuffix}`;
}