"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { DEMO_PORTAL_STORAGE_KEY, createDemoPortalSession, demoRoles, type DemoPortalSession, type DemoRole } from "@/lib/demo-mode";
import { roleLabels } from "@/lib/domain";

type DemoMetric = {
  label: string;
  value: string;
  detail: string;
};

type DemoModule = {
  title: string;
  description: string;
  image: string;
};

const demoContent: Record<DemoRole, { eyebrow: string; title: string; description: string; metrics: DemoMetric[]; modules: DemoModule[] }> = {
  admin: {
    eyebrow: "Modo test local · Administrador",
    title: "Muestra la operacion administrativa sin depender de una sesion real.",
    description: "Este recorrido local sirve para exhibir la estructura de modulos que ya existen en el portal admin: overview, reclamos, canales, outbound, expensas, unidades, padron, amenities, seguridad y proveedores.",
    metrics: [
      { label: "Modulos visibles", value: "12", detail: "Paneles clave del rol administrador" },
      { label: "Capas reales", value: "RLS + RPC", detail: "La demo no las toca, solo muestra el alcance" },
      { label: "Uso sugerido", value: "Ventas", detail: "Ideal para mostrar el producto antes de conectar un tenant" },
    ],
    modules: [
      { title: "Consorcio integrado", description: "Tablero central con overview, aprobaciones y operacion diaria.", image: "/media/flyers/consorcio-integrado-1.png" },
      { title: "Reclamos y mantenimiento", description: "Tickets, estados, seguimiento y trazabilidad operativa.", image: "/media/flyers/reclamos-1.png" },
      { title: "Reservas y amenities", description: "Reglas, agenda visual y aprobaciones por espacio.", image: "/media/flyers/reservas.png" },
      { title: "Transparencia financiera", description: "Expensas, comprobantes y lectura clara para el vecino.", image: "/media/flyers/transparencia-financiera.png" },
    ],
  },
  residente: {
    eyebrow: "Modo test local · Usuario",
    title: "Expone la experiencia del vecino con foco en claridad y autoservicio.",
    description: "La demo local del portal usuario deja mostrar reservas, reclamos, expensas, visitas y comunicacion comunitaria sin requerir alta real contra Supabase.",
    metrics: [
      { label: "Modulos visibles", value: "6", detail: "Vista sintetica del recorrido residente" },
      { label: "Objetivo", value: "Adopcion", detail: "Explicar beneficios concretos al vecino" },
      { label: "Canales", value: "Web + PWA", detail: "La misma experiencia se puede mostrar en escritorio o movil" },
    ],
    modules: [
      { title: "Reservas faciles", description: "Reserva amenities con calendario y reglas claras.", image: "/media/flyers/reservas.png" },
      { title: "Expensas transparentes", description: "Importes, estados y respaldo visual para el residente.", image: "/media/flyers/transparencia-financiera.png" },
      { title: "Reclamos trazables", description: "Seguimiento de incidentes sin perder contexto.", image: "/media/flyers/reclamos-2.png" },
      { title: "Comunidad conectada", description: "El vecino entiende rapido que modulos tiene disponibles.", image: "/media/flyers/consorcio-integrado-2.png" },
    ],
  },
  seguridad: {
    eyebrow: "Modo test local · Seguridad",
    title: "Permite mostrar el circuito de accesos y validaciones del portal de guardia.",
    description: "La demo de seguridad cubre controles de acceso, QR, visitas, registro documental y la vista operativa que el puesto necesita para trabajar rapido.",
    metrics: [
      { label: "Puestos demo", value: "1", detail: "Cabina y acceso principal" },
      { label: "Escenario", value: "Ingreso", detail: "Validacion visual de visitas y proveedores" },
      { label: "Uso sugerido", value: "Capacitacion", detail: "Sirve para mostrar el circuito al personal de guardia" },
    ],
    modules: [
      { title: "Control de accesos", description: "Cabina, QR y validaciones operativas desde el ingreso.", image: "/media/flyers/ingreso-seguridad.png" },
      { title: "Visitas y autorizaciones", description: "Cruce rapido entre residente, invitado y acceso habilitado.", image: "/media/flyers/consorcio-integrado-2.png" },
      { title: "Reclamos desde guardia", description: "Seguimiento visible para eventos detectados en el puesto.", image: "/media/flyers/reclamos-1.png" },
      { title: "Operacion coordinada", description: "La seguridad tambien queda integrada al resto del sistema.", image: "/media/flyers/consorcio-integrado-1.png" },
    ],
  },
};

type DemoPortalExperienceProps = {
  role: DemoRole;
};

export function DemoPortalExperience({ role }: DemoPortalExperienceProps) {
  const router = useRouter();
  const [demoSession, setDemoSession] = useState<DemoPortalSession>(() => createDemoPortalSession(role));
  const content = demoContent[role];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DEMO_PORTAL_STORAGE_KEY);
      if (!raw) {
        const nextSession = createDemoPortalSession(role);
        window.localStorage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(nextSession));
        startTransition(() => {
          setDemoSession(nextSession);
        });
        return;
      }

      const parsed = JSON.parse(raw) as Partial<DemoPortalSession>;
      if (parsed.role !== role) {
        const nextSession = createDemoPortalSession(role);
        window.localStorage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(nextSession));
        startTransition(() => {
          setDemoSession(nextSession);
        });
        return;
      }

      startTransition(() => {
        setDemoSession({ ...createDemoPortalSession(role), ...parsed, role });
      });
    } catch {
      startTransition(() => {
        setDemoSession(createDemoPortalSession(role));
      });
    }
  }, [role]);

  function primeRole(nextRole: DemoRole) {
    const nextSession = createDemoPortalSession(nextRole);
    window.localStorage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(nextSession));
    setDemoSession(nextSession);
  }

  function exitDemoMode() {
    window.localStorage.removeItem(DEMO_PORTAL_STORAGE_KEY);
    startTransition(() => {
      router.push("/portal/plataforma");
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.16),_transparent_26%),linear-gradient(180deg,_#eff6ff_0%,_#f8fafc_55%,_#ffffff_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <header className="glass-panel flex flex-col gap-4 rounded-[2rem] px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Comunitaria · {demoSession.invitationCode}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{demoSession.tenantName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">Modo test local activado desde SuperUser para mostrar el portal de {roleLabels[role].toLowerCase()} sin tocar sesiones reales ni datos de Supabase.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-medium">
            <Link className="button-secondary" href="/">
              Inicio
            </Link>
            <Link className="button-secondary" href="/portal/plataforma">
              SuperUser
            </Link>
            <button className="button-primary" onClick={exitDemoMode} type="button">
              Salir del modo test
            </button>
          </div>
        </header>

        <main className="mt-6 flex-1">
          <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <article className="glass-panel rounded-[2rem] p-6 lg:p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{content.eyebrow}</p>
              <h2 className="mt-4 max-w-4xl text-3xl font-semibold tracking-[-0.05em] text-slate-950 lg:text-5xl">{content.title}</h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">{content.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {demoRoles.map((item) => (
                  <Link className={item === role ? "button-primary" : "button-secondary"} href={`/portal/demo/${item}`} key={item} onClick={() => primeRole(item)}>
                    {roleLabels[item]}
                  </Link>
                ))}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {content.metrics.map((item) => (
                  <article className="metric-card" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </article>
                ))}
              </div>
            </article>

            <article className="glass-panel overflow-hidden rounded-[2rem] p-3">
              <div className="relative overflow-hidden rounded-[1.6rem] border border-white/80">
                <Image alt={`Portada demo ${roleLabels[role]}`} className="h-[30rem] w-full object-cover" height={1024} priority src={content.modules[0]?.image ?? "/media/flyers/consorcio-integrado-1.png"} width={1024} />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/16 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="rounded-[1.5rem] border border-white/15 bg-slate-950/35 p-5 backdrop-blur-md">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-200">Showcase local</p>
                    <p className="mt-3 text-2xl font-semibold text-white">Perfil {roleLabels[role]} listo para demo comercial o capacitacion.</p>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="mt-6 glass-panel rounded-[2rem] p-6 lg:p-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Modulos visibles</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Recorrido guiado del portal de {roleLabels[role].toLowerCase()}</h3>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {content.modules.map((item) => (
                <article className="glass-panel overflow-hidden rounded-[2rem] p-3" key={item.title}>
                  <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/90">
                    <Image alt={item.title} className="h-56 w-full object-cover" height={1024} src={item.image} width={1024} />
                    <div className="space-y-3 p-5">
                      <p className="text-lg font-semibold text-slate-950">{item.title}</p>
                      <p className="text-sm leading-7 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}