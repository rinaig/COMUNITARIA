import { AdminApprovalsPanel } from "@/components/admin-approvals-panel";
import { AdminAccessRosterImportPanel } from "@/components/admin-access-roster-import-panel";
import { AdminAmenitiesPanel } from "@/components/admin-amenities-panel";
import { AdminChannelIntegrationsPanel } from "@/components/admin-channel-integrations-panel";
import { AdminDocumentsPanel } from "@/components/admin-documents-panel";
import { AdminFinancePanel } from "@/components/admin-finance-panel";
import { AdminGuardPostsPanel } from "@/components/admin-guard-posts-panel";
import { AdminLiveOverview } from "@/components/admin-live-overview";
import { AdminOutboundDeliveriesPanel } from "@/components/admin-outbound-deliveries-panel";
import { AdminOperationsPanel } from "@/components/admin-operations-panel";
import { AdminProvidersPanel } from "@/components/admin-providers-panel";
import { AdminSubscriptionPricingPanel } from "@/components/admin-subscription-pricing-panel";
import { AdminUnitImportPanel } from "@/components/admin-unit-import-panel";
import { CommunityTopicsPanel } from "@/components/community-topics-panel";
import { PortalAccessGuard } from "@/components/portal-access-guard";
import { ReservationsLivePanel } from "@/components/reservations-live-panel";
import { ResidentClaimsPanel } from "@/components/resident-claims-panel";
import { ResidentDependentApprovalsPanel } from "@/components/resident-dependent-approvals-panel";
import { ResidentExpensesPanel } from "@/components/resident-expenses-panel";
import { ResidentLiveOverview } from "@/components/resident-live-overview";
import { ResidentVisitsPanel } from "@/components/resident-visits-panel";
import { SecurityLiveOverview } from "@/components/security-live-overview";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { roleLabels, type AppRole } from "@/lib/domain";

type RolePageProps = {
  params: Promise<{ role: string }>;
};

const portalRoles: AppRole[] = ["admin", "residente", "seguridad"];

export function generateStaticParams() {
  return portalRoles.map((role) => ({ role }));
}

export default async function RolePortalPage({ params }: RolePageProps) {
  const { role } = await params;
  const isAdmin = role === "admin";

  if (!portalRoles.includes(role as AppRole)) {
    notFound();
  }

  return (
    <PortalShell role={role as AppRole}>
      <PortalAccessGuard requiredRole={role as AppRole}>
      {isAdmin ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="glass-panel rounded-[2rem] p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Operacion administrativa real
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
                Tablero operativo conectado al consorcio autenticado.
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                Esta vista ya no depende de datos de demostracion. Reclamos, gastos, anuncios, reservas y altas pendientes se leen desde Supabase segun el consorcio y el rol del administrador autenticado.
              </p>
            </article>

            <article className="glass-panel rounded-[2rem] p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Seguridad de acceso
              </p>
              <div className="mt-6 space-y-4">
                <div className="role-card">
                  <h3 className="text-2xl font-semibold text-slate-950">Administrador</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    Todas las consultas del tablero pasan por RLS. Si la sesion no pertenece a este consorcio, el portal no expone sus datos operativos.
                  </p>
                </div>
                <div className="role-card">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                    Estado actual
                  </p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">
                    Produccion guiada por datos reales
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    El contenido demostrativo queda reservado para los otros roles mientras se migran sus ultimos bloques pendientes.
                  </p>
                </div>
              </div>
            </article>
          </section>

          <AdminLiveOverview />
          <AdminOperationsPanel />
          <AdminChannelIntegrationsPanel />
          <AdminOutboundDeliveriesPanel />
          <AdminFinancePanel />
          <AdminSubscriptionPricingPanel />
          <AdminUnitImportPanel />
          <AdminAccessRosterImportPanel />
          <AdminAmenitiesPanel />
          <AdminGuardPostsPanel />
          <AdminProvidersPanel />
          <AdminDocumentsPanel />
          <CommunityTopicsPanel />
          <ReservationsLivePanel role="admin" />
          <AdminApprovalsPanel />
        </>
      ) : (
      <>
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Portal autenticado
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
            Vista real para {roleLabels[role as AppRole].toLowerCase()} conectada al consorcio activo.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            Los paneles de este rol leen datos reales desde Supabase segun la sesion autenticada y las politicas RLS. Se retiraron las metricas simuladas de la cabecera para no confundir una demo visual con filas persistidas.
          </p>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Coherencia operativa
          </p>
          <div className="mt-6 space-y-4">
            <div className="role-card">
              <h3 className="text-2xl font-semibold text-slate-950">
                {roleLabels[role as AppRole]}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                El acceso se filtra por rol y por consorcio. Si el onboarding falla o el perfil no queda asociado a un consorcio, este portal no inventa datos y no puede mostrar actividad real.
              </p>
            </div>
            <div className="role-card">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                Alcance de esta vista
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Contenido respaldado por Supabase</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Reclamos, visitas, reservas, chat y aprobaciones dependen del tenant autenticado. Los bloques demo estaticos se eliminaron de esta portada para evitar lecturas incoherentes.
              </p>
            </div>
          </div>
        </article>
      </section>

      <CommunityTopicsPanel />
      </>
      )}
      {role === "residente" ? <ResidentLiveOverview /> : null}
      {role === "residente" ? <ResidentDependentApprovalsPanel /> : null}
      {role === "residente" ? <ResidentExpensesPanel /> : null}
      {role === "residente" ? <ReservationsLivePanel role="residente" /> : null}
      {role === "residente" ? <ResidentClaimsPanel /> : null}
      {role === "residente" ? <ResidentVisitsPanel /> : null}
      {role === "seguridad" ? <SecurityLiveOverview /> : null}
      </PortalAccessGuard>
    </PortalShell>
  );
}