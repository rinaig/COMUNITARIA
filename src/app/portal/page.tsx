import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";
import {
  demoRoles,
  onboardingSteps,
  platformDemoNotes,
  platformDemoSummary,
  platformHighlights,
  roleLabels,
} from "@/lib/domain";

export default function PortalIndexPage() {
  return (
    <PortalShell>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Arquitectura base
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
            SaaS multi-tenant listo para crecer por edificio o barrio.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Esta primera version deja resuelto el esqueleto del negocio: roles del consorcio, demo navegable para clientes, reglas de reservas y capa de datos preparada para Supabase.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {platformHighlights.map((item) => (
              <article className="role-card" key={item.title}>
                <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Roles visibles en la demo
          </p>
          <div className="mt-6 grid gap-4">
            {demoRoles.map((role) => (
              <Link
                className="role-card transition-transform duration-200 hover:-translate-y-0.5"
                href={`/portal/${role}`}
                key={role}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-slate-950">
                      {roleLabels[role]}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      Ver la maqueta funcional del portal y los indicadores principales de este rol dentro de un consorcio demo.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                    Demo
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Flujo de onboarding
          </p>
          <div className="mt-6 grid gap-4">
            {onboardingSteps.map((step, index) => (
              <div className="role-card" key={step}>
                <p className="text-sm font-semibold text-slate-500">Paso {index + 1}</p>
                <p className="mt-2 text-base leading-7 text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Alcance implementado
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              "Landing corporativa alineada al mercado de consorcios de Argentina.",
              "Portales demo por rol con datos verosimiles de operacion del consorcio.",
              "Motor de validacion para reservas sin doble booking.",
              "Manifest, icono y service worker basico para modo PWA.",
              "Esquema SQL Supabase con RLS y tablas multi-tenant.",
              "Capa de integracion y archivo de entorno para pasar a datos reales.",
            ].map((item) => (
              <article className="role-card" key={item}>
                <p className="text-base leading-7 text-slate-700">{item}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Consola interna del operador
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Tu vista de plataforma queda separada del demo comercial.
          </h3>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Esta consola esta pensada para vos como operador de Comunitaria: seguimiento agregado de administradores, consorcios activos y volumen total de usuarios, sin abrir datos privados de vecinos o unidades.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="metric-card">
              <span>Consorcios activos</span>
              <strong>{platformDemoSummary.activeConsorcios}</strong>
              <small>Base demo para seguimiento comercial</small>
            </article>
            <article className="metric-card">
              <span>Administradores activos</span>
              <strong>{platformDemoSummary.activeAdmins}</strong>
              <small>{platformDemoSummary.pendingAdmins} onboarding pendientes</small>
            </article>
            <article className="metric-card">
              <span>Usuarios totales</span>
              <strong>{platformDemoSummary.totalUsers}</strong>
              <small>Solo conteo agregado, sin detalle personal</small>
            </article>
            <article className="metric-card">
              <span>Crecimiento mensual</span>
              <strong>{platformDemoSummary.monthlyGrowth}</strong>
              <small>Preparado para conectar pagos mas adelante</small>
            </article>
          </div>

          <Link className="button-primary mt-6 inline-flex" href="/portal/plataforma">
            Abrir consola interna demo
          </Link>
        </article>

        <article className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Criterios de privacidad
          </p>
          <div className="mt-6 grid gap-4">
            {platformDemoNotes.map((item) => (
              <article className="role-card" key={item}>
                <p className="text-base leading-7 text-slate-700">{item}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </PortalShell>
  );
}