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
import {
  demoRoles,
  roleDashboards,
  roleLabels,
  sampleReservations,
  tenantSnapshot,
  type AppRole,
  type DemoRole,
} from "@/lib/domain";
import { evaluateReservationRequest } from "@/lib/reservations";

type RolePageProps = {
  params: Promise<{ role: string }>;
};

export function generateStaticParams() {
  return demoRoles.map((role) => ({ role }));
}

export default async function RolePortalPage({ params }: RolePageProps) {
  const { role } = await params;
  const isAdmin = role === "admin";

  if (!demoRoles.includes(role as DemoRole)) {
    notFound();
  }

  const dashboard = roleDashboards[role as AppRole];
  const reservationDecision = evaluateReservationRequest(
    sampleReservations,
    {
      consorcioId: tenantSnapshot.id,
      unitId: "UF-4B",
      amenityId: "sum",
      date: "2026-05-22",
      startsAt: "19:00",
      endsAt: "22:00",
    },
    2,
  );

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
            {dashboard.eyebrow}
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
            {dashboard.title}
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            {dashboard.intro}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.stats.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Seguridad de datos
          </p>
          <div className="mt-6 space-y-4">
            <div className="role-card">
              <h3 className="text-2xl font-semibold text-slate-950">
                {roleLabels[role as AppRole]}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                El acceso se filtra por rol y por consorcio. En produccion, cada query a Supabase quedaria condicionada por politicas RLS asociadas al usuario autenticado.
              </p>
            </div>
            <div className="role-card">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                Tenant activo
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-950">{tenantSnapshot.name}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {tenantSnapshot.address} · {tenantSnapshot.units} unidades · {tenantSnapshot.plan}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Prioridades
          </p>
          <div className="mt-6 grid gap-4">
            {dashboard.priorities.map((item) => (
              <article className="role-card" key={item.title}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {item.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                    {item.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Comunicaciones y alertas
          </p>
          <div className="mt-6 grid gap-4">
            {dashboard.communications.map((item) => (
              <article className="role-card" key={item.title}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {item.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                    {item.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <CommunityTopicsPanel />

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="glass-panel rounded-[2rem] p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {dashboard.recordsTitle}
              </p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Trazabilidad operativa
              </h3>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-600">{dashboard.recordsHint}</p>
          </div>

          <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/90">
            <div className="grid grid-cols-[1.3fr_1fr_0.9fr_0.9fr] gap-4 border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              <span>Item</span>
              <span>Detalle</span>
              <span>Estado</span>
              <span>Fecha</span>
            </div>
            {dashboard.records.map((record) => (
              <div
                className="grid grid-cols-[1.3fr_1fr_0.9fr_0.9fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700 last:border-b-0"
                key={`${record.primary}-${record.date}`}
              >
                <div className="font-semibold text-slate-900">{record.primary}</div>
                <div>{record.secondary}</div>
                <div>{record.state}</div>
                <div>{record.date}</div>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Motor de reglas
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Validacion de reservas del MVP
          </h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Se evalua una solicitud para el SUM de la unidad UF-4B el 22 de mayo de 19:00 a 22:00. Ya existe una reserva de 18:00 a 21:00 y ademas la unidad alcanzo el maximo mensual de 2 reservas.
          </p>

          <div className="mt-6 grid gap-4">
            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Doble booking</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {reservationDecision.hasConflict ? "Bloqueado por solapamiento" : "Sin conflicto"}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Reserva coincidente: {reservationDecision.matchingReservationId ?? "ninguna"}
              </p>
            </article>
            <article className="role-card">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Limite por unidad</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {reservationDecision.reachedMonthlyLimit ? "Maximo mensual alcanzado" : "Dentro del limite"}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Resultado final: {reservationDecision.allowed ? "Reserva aprobable" : "Reserva rechazada"}
              </p>
            </article>
          </div>
        </article>
      </section>
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