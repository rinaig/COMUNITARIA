import Image from "next/image";
import Link from "next/link";
import { PlatformPublicFooter } from "@/components/platform-public-footer";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-1 flex-col bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.16),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_36%,_#f3f4f6_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center gap-10 px-6 py-8 lg:px-10 lg:py-10">
        <header className="flex items-center justify-between">
          <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
            <Image alt="Logo Comunitaria" className="w-[156px]" height={84} priority src="/brand/comunitaria-logo.png" style={{ height: "auto" }} width={156} />
          </div>
          <Link className="button-primary" href="/auth">
            Ingresar
          </Link>
        </header>

        <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-6">
            <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl lg:text-7xl">
              Gestion simple para consorcios, barrios privados y countries.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
              Acceso real para administradores, usuarios y seguridad, con prueba inicial controlada y operacion basada en Supabase.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary" href="/auth">
                Acceder a la plataforma
              </Link>
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
      </div>

      <PlatformPublicFooter />
    </main>
  );
}
