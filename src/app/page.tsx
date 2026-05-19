import Image from "next/image";
import Link from "next/link";
import { PlatformPublicFooter } from "@/components/platform-public-footer";

const profileCards = [
  {
    title: "Administrador",
    description: "Centraliza unidades, avisos, gastos, reservas y seguimiento operativo del consorcio desde un solo panel.",
    image: "/media/modulo-seguridad.png",
    alt: "Panel administrativo de expensas y control",
  },
  {
    title: "Usuario",
    description: "Reserva amenities, sigue reclamos, consulta documentacion y recibe avisos claros sin depender de chats caoticos.",
    image: "/media/modulo-reservas.png",
    alt: "Modulo de reservas para usuarios",
  },
  {
    title: "Seguridad",
    description: "Gestiona accesos, visitas, controles documentales y validaciones diarias desde una vista rapida y operativa.",
    image: "/media/modulo-expensas.png",
    alt: "Modulo de seguridad y accesos",
  },
];

const featureCards = [
  {
    title: "Reservas sin superposiciones",
    description: "Calendario visual para SUM, parrilla, pileta o canchas, con reglas de uso y bloqueos por mantenimiento.",
    image: "/media/modulo-reservas.png",
    alt: "Calendario de reservas",
  },
  {
    title: "Transparencia en expensas",
    description: "Cada gasto se puede acompañar con comprobantes, estados y una vista comprensible para el vecino.",
    image: "/media/modulo-seguridad.png",
    alt: "Modulo de expensas y transparencia",
  },
  {
    title: "Reclamos con seguimiento",
    description: "Los incidentes pasan de pendiente a resuelto con historial visible para evitar duplicados y desorden operativo.",
    image: "/media/modulo-reclamos.png",
    alt: "Modulo de reclamos y seguimiento",
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-1 flex-col bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.16),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_36%,_#f3f4f6_100%)]">
      <header className="w-full border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Image alt="Logo Comunitaria" className="w-[156px]" height={84} priority src="/brand/comunitaria-logo.png" style={{ height: "auto" }} width={156} />
          </div>
          <Link className="button-primary" href="/auth">
            Acceso a la plataforma
          </Link>
        </div>
      </header>

      <div className="flex w-full flex-1 flex-col gap-12 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <section className="grid gap-8 pt-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-6">
            <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl lg:text-7xl">
              Gestion simple para consorcios, barrios privados y countries.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
              Una plataforma multi-inquilino para administrar reservas, expensas, reclamos, anuncios y accesos con perfiles claros para administracion, usuarios y seguridad.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary" href="/auth">
                Acceder a la plataforma
              </Link>
            </div>
            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <div className="role-card">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Multi-consorcio</p>
                <p className="mt-3 text-base font-semibold text-slate-900">Un solo sistema, datos aislados por edificio o barrio.</p>
              </div>
              <div className="role-card">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operacion diaria</p>
                <p className="mt-3 text-base font-semibold text-slate-900">Menos WhatsApp, menos Excel y mas trazabilidad real.</p>
              </div>
              <div className="role-card">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Seguridad</p>
                <p className="mt-3 text-base font-semibold text-slate-900">Accesos, autorizaciones y control documental en una sola vista.</p>
              </div>
            </div>
          </div>

          <div className="glass-panel overflow-hidden rounded-[2rem] p-3">
            <div className="relative overflow-hidden rounded-[1.6rem] border border-white/80">
              <Image alt="Vista operativa de Comunitaria" className="h-[28rem] w-full object-cover" height={816} priority src="/media/modulo-seguridad.png" width={1312} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="rounded-[1.5rem] border border-white/15 bg-white/12 p-5 backdrop-blur-md">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-200">
                    Plataforma Comunitaria
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    Reservas, expensas, seguridad, reclamos y accesos desde un solo lugar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Tres perfiles, una operacion coordinada</p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
              Cada perfil entiende rapido que puede hacer y para que sirve la plataforma.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {profileCards.map((card) => (
              <article className="glass-panel overflow-hidden rounded-[2rem] p-3" key={card.title}>
                <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/90">
                  <Image alt={card.alt} className="h-52 w-full object-cover" height={520} src={card.image} width={900} />
                  <div className="space-y-3 p-5">
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-500">{card.title}</p>
                    <p className="text-xl font-semibold text-slate-950">{card.description}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div className="glass-panel overflow-hidden rounded-[2rem] p-3">
            <div className="flex min-h-[18rem] items-center justify-center rounded-[1.6rem] border border-white/80 bg-white p-6 sm:min-h-[24rem] lg:min-h-[30rem]">
              <Image alt="Logo institucional Comunitaria" className="h-auto w-full max-w-[42rem] object-contain" height={1200} src="/brand/comunitaria-logo.png" width={1200} />
            </div>
          </div>
          <div className="space-y-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Que resuelve Comunitaria</p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
              Ordena la administracion, mejora la comunicacion y da transparencia visible al vecino.
            </h2>
            <div className="grid gap-4">
              {featureCards.map((card) => (
                <article className="role-card flex flex-col gap-4 sm:flex-row" key={card.title}>
                  <Image alt={card.alt} className="h-24 w-28 rounded-2xl object-cover" height={240} src={card.image} width={280} />
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{card.title}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{card.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      <PlatformPublicFooter />
    </main>
  );
}
