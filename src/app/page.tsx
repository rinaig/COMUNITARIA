import Image from "next/image";
import Link from "next/link";

const modules = [
  {
    eyebrow: "Reservas",
    title: "Reservas sin conflictos",
    description:
      "Calendario visual para SUM, parrilla y canchas con bloqueo de horarios y reglas por unidad.",
    image: "/media/modulo-reservas.png",
    alt: "Panel de reservas del consorcio",
  },
  {
    eyebrow: "Expensas",
    title: "Transparencia radical",
    description:
      "Cada gasto puede publicarse con su comprobante adjunto para bajar reclamos y auditorias manuales.",
    image: "/media/modulo-expensas.png",
    alt: "Modulo de administracion y expensas",
  },
  {
    eyebrow: "Seguridad",
    title: "Seguridad operativa",
    description:
      "Autorizaciones de visitas, control de proveedores y alertas de ART vencida para guardia o encargado.",
    image: "/media/modulo-seguridad.png",
    alt: "Modulo de seguridad y porteria",
  },
  {
    eyebrow: "Reclamos",
    title: "Reclamos con seguimiento",
    description:
      "Tickets con estados, responsables y visibilidad para evitar duplicados y caos por WhatsApp.",
    image: "/media/modulo-reclamos.png",
    alt: "Modulo de reclamos y mantenimiento",
  },
];

const roles = [
  {
    name: "Administrador",
    summary: "Gestiona unidades, gastos, reclamos, reservas y aprobaciones del edificio.",
  },
  {
    name: "Residente",
    summary: "Reserva amenities, consulta expensas, crea reclamos y autoriza visitas.",
  },
  {
    name: "Seguridad",
    summary: "Ve ingresos autorizados, QR y documentacion critica de proveedores.",
  },
];

const metrics = [
  {
    label: "Reclamos abiertos",
    value: "12",
    detail: "4 en reparacion",
  },
  {
    label: "Reservas del mes",
    value: "84",
    detail: "SUM lidera con 37",
  },
  {
    label: "Visitas autorizadas",
    value: "26",
    detail: "3 QR pendientes",
  },
  {
    label: "Documentos vencidos",
    value: "2",
    detail: "ART proveedor jardineria",
  },
];

export default function Home() {
  return (
    <main className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.16),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_36%,_#f3f4f6_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-6 py-8 lg:px-10 lg:py-10">
        <header className="glass-panel flex items-center justify-between rounded-full px-5 py-3">
          <div className="flex items-center gap-4">
            <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-2 shadow-sm">
              <Image alt="Logo Comunitaria" className="h-auto w-[132px]" height={72} priority src="/brand/comunitaria-logo.png" width={132} />
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              SaaS multi-tenant
            </p>
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Comunitaria</h1>
              <p className="text-sm text-slate-500">Gestion transparente para consorcios y barrios privados</p>
            </div>
          </div>
          <Link className="button-primary" href="/portal/admin">
            Ver demo del portal
          </Link>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="space-y-8">
            <div className="inline-flex rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-600 shadow-sm backdrop-blur">
              Argentina 2026 · PWA · Supabase ready
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur md:max-w-xl">
                <Image alt="Marca Comunitaria" className="h-auto w-[172px]" height={92} priority src="/brand/comunitaria-logo.png" width={172} />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Identidad de marca</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">La portada ahora usa la identidad visual y los recursos que dejaste en el proyecto.</p>
                </div>
              </div>
              <h2 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl lg:text-7xl">
                Menos WhatsApp. Mas control operativo para cada edificio.
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                Plataforma pensada para administradores de consorcios y barrios privados con foco en reservas, reclamos, expensas, seguridad y trazabilidad documental.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <Link className="button-primary" href="/portal/admin">
                Entrar como administrador
              </Link>
              <Link className="button-primary" href="/auth?tipo=admin&modo=demo">
                Probar gratis hasta 3 unidades
              </Link>
              <Link className="button-secondary" href="/portal/plataforma">
                Consola interna demo
              </Link>
              <Link className="button-secondary" href="/auth">
                Ingresar o crear cuenta
              </Link>
              <a className="button-secondary" href="#modulos">
                Explorar modulos
              </a>
            </div>
          </div>

          <div className="glass-panel overflow-hidden rounded-[2rem] p-3">
            <div className="relative overflow-hidden rounded-[1.6rem] border border-white/80">
              <Image alt="Vista general de un barrio privado operado con Comunitaria" className="h-[28rem] w-full object-cover" height={816} priority src="/media/modulo-seguridad.png" width={1312} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
                <div className="rounded-full border border-white/25 bg-slate-950/35 px-4 py-2 text-xs uppercase tracking-[0.26em] text-white backdrop-blur">
                  Operacion centralizada
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                  92% al dia
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="rounded-[1.5rem] border border-white/15 bg-white/12 p-5 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/15 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-200">
                        Torre Alvear
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        Panel operativo del dia
                      </p>
                    </div>
                    <Image alt="Isotipo Comunitaria" className="h-auto w-16" height={64} src="/brand/comunitaria-isotipo.png" width={64} />
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {metrics.map((metric) => (
                      <article className="rounded-[1.35rem] border border-white/15 bg-white/10 p-4 text-white backdrop-blur" key={metric.label}>
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-200">{metric.label}</span>
                        <strong className="mt-3 block text-3xl font-semibold">{metric.value}</strong>
                        <small className="mt-2 block text-sm text-slate-200">{metric.detail}</small>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modulos" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {modules.map((module) => (
            <article className="glass-panel overflow-hidden rounded-[1.75rem] p-3" key={module.title}>
              <div className="overflow-hidden rounded-[1.35rem] border border-white/80 bg-white/80">
                <Image alt={module.alt} className="h-52 w-full object-cover" height={816} src={module.image} width={1312} />
              </div>
              <div className="p-3 pb-4 pt-5">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
                  {module.eyebrow}
                </p>
                <h3 className="mt-4 text-2xl font-semibold text-slate-950">{module.title}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">
                  {module.description}
                </p>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <article className="glass-panel rounded-[2rem] p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Diferencial comercial
            </p>
            <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Transparencia para bajar conflicto y carga operativa.
            </h3>
            <p className="mt-4 text-base leading-8 text-slate-600">
              La plataforma unifica gastos, comprobantes, anuncios, tickets y accesos. El administrador deja de repartir informacion en PDFs, mails y chats inconexos.
            </p>
            <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/85">
              <Image alt="Vista del modulo de administracion y expensas" className="h-64 w-full object-cover" height={816} src="/media/modulo-expensas.png" width={1312} />
            </div>
          </article>

          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((role) => (
              <article className="role-card" key={role.name}>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Rol</p>
                <h3 className="mt-3 text-2xl font-semibold text-slate-950">{role.name}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">{role.summary}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
