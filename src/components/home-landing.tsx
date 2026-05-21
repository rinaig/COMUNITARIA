"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import { PlatformPublicFooter } from "@/components/platform-public-footer";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { HOME_CONTENT_STORAGE_KEY, getDefaultHomeContent, normalizeHomeContent } from "@/lib/home-content";
import { loadPlatformSettingsCompat } from "@/lib/platform-schema-compat";

const WELCOME_MODAL_STORAGE_KEY = "comunitaria.home.welcome.v1";

const welcomeFlyers = [
  "/media/flyers/presentacion-1.png",
  "/media/flyers/presentacion-2.png",
  "/media/flyers/presentacion-3.png",
];

const roleCards = [
  {
    title: "Panel de administracion y expensas",
    description: "Concentra unidades, cobranzas, reclamos, proveedores, amenities y comunicaciones operativas del consorcio.",
    summary: "Es la consola de trabajo del administrador para operar el edificio y seguir cada circuito critico desde un unico panel.",
    image: "/media/flyers/consorcio-integrado-1.png",
    alt: "Flyer de consorcio integrado para administradores",
  },
  {
    title: "Portal del vecino",
    description: "Consulta expensas, reserva amenities, sigue reclamos y recibe avisos claros sin depender de cadenas de chat.",
    summary: "Resume la experiencia del residente: autoservicio, transparencia y seguimiento claro de su vida diaria dentro del consorcio.",
    image: "/media/flyers/transparencia-financiera.png",
    alt: "Flyer de transparencia financiera para usuarios",
  },
  {
    title: "Control de accesos y porteria",
    description: "Opera accesos, visitas, QR, validaciones y controles documentales desde un flujo rapido y visible.",
    summary: "Representa el frente operativo de guardia para ingresos, visitas, proveedores y validaciones en tiempo real.",
    image: "/media/flyers/ingreso-seguridad.png",
    alt: "Flyer de control de accesos para seguridad",
  },
];

export function HomeLanding() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeFlyer, setWelcomeFlyer] = useState(welcomeFlyers[0]);
  const [homeContent, setHomeContent] = useState(() => getDefaultHomeContent());
  const [expandedTopic, setExpandedTopic] = useState<string>("");

  useEffect(() => {
    let ignore = false;
    let hasLocalPreview = false;

    try {
      const preview = window.localStorage.getItem(HOME_CONTENT_STORAGE_KEY);
      if (preview) {
        hasLocalPreview = true;
        startTransition(() => {
          setHomeContent(normalizeHomeContent(JSON.parse(preview) as Record<string, unknown>));
        });
      }
    } catch {
      hasLocalPreview = false;
    }

    if (!configured || !supabase) {
      return;
    }

    const load = async () => {
      const result = await loadPlatformSettingsCompat(supabase);

      if (!ignore && !result.error && !hasLocalPreview) {
        startTransition(() => {
          setHomeContent(result.data.home_content);
        });
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [configured, supabase]);

  useEffect(() => {
    if (expandedTopic && !homeContent.modules.some((item) => item.id === expandedTopic)) {
      startTransition(() => {
        setExpandedTopic("");
      });
    }
  }, [expandedTopic, homeContent.modules]);

  useEffect(() => {
    try {
      const forceWelcome = searchParams.get("bienvenida") === "1";

      if (!forceWelcome && window.localStorage.getItem(WELCOME_MODAL_STORAGE_KEY) === "seen") {
        return;
      }

      const randomIndex = Math.floor(Math.random() * welcomeFlyers.length);
      startTransition(() => {
        setWelcomeFlyer(welcomeFlyers[randomIndex] ?? welcomeFlyers[0]);
        setWelcomeOpen(true);
      });
    } catch {
      startTransition(() => {
        setWelcomeFlyer(welcomeFlyers[0]);
        setWelcomeOpen(true);
      });
    }
  }, [searchParams]);

  function openWelcome() {
    const randomIndex = Math.floor(Math.random() * welcomeFlyers.length);
    setWelcomeFlyer(welcomeFlyers[randomIndex] ?? welcomeFlyers[0]);
    setWelcomeOpen(true);
  }

  function closeWelcome() {
    try {
      window.localStorage.setItem(WELCOME_MODAL_STORAGE_KEY, "seen");
    } catch {
      // ignore localStorage failures in preview-only environments
    }
    setWelcomeOpen(false);
  }

  return (
    <>
      <main className="relative flex min-h-screen flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(29,78,216,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.16),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#edf4ff_38%,_#f8fafc_100%)]">
        <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/92 shadow-sm backdrop-blur">
          <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-20">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <Image alt="Logo Comunitaria" className="h-auto w-[156px]" height={84} priority src="/brand/comunitaria-logo.png" width={156} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary" href="/auth">
                Ingresar
              </Link>
            </div>
          </div>
        </header>

        <div className="flex w-full flex-1 flex-col gap-12 px-4 py-6 sm:px-6 lg:px-10 lg:py-10 xl:px-14 2xl:px-20">
          <section className="grid gap-8 pt-4 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-[0.32em] text-sky-800">{homeContent.heroEyebrow}</p>
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-slate-950 md:text-6xl lg:text-7xl">
                {homeContent.heroTitle}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                {homeContent.heroDescription}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link className="button-primary" href="/auth">
                  Ingresar a la plataforma
                </Link>
                <button className="button-secondary" onClick={openWelcome} type="button">
                  Ver bienvenida
                </button>
              </div>
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                <div className="role-card">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Arquitectura multi-consorcio</p>
                  <p className="mt-3 text-base font-semibold text-slate-900">Un solo sistema con datos aislados por edificio, barrio o country.</p>
                </div>
                <div className="role-card">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operacion diaria centralizada</p>
                  <p className="mt-3 text-base font-semibold text-slate-900">Reservas, reclamos, expensas, seguridad y cola saliente en una misma capa operativa.</p>
                </div>
                <div className="role-card">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Perfiles coordinados</p>
                  <p className="mt-3 text-base font-semibold text-slate-900">Administracion, residentes y seguridad trabajan sobre una misma base operativa sin mezclar roles ni alcance.</p>
                </div>
              </div>
            </div>

            <article className="glass-panel overflow-hidden rounded-[2rem] p-3">
              <div className="relative overflow-hidden rounded-[1.6rem] border border-white/80">
                <Image alt="Flyer principal de Comunitaria" className="h-[30rem] w-full object-cover" height={1024} priority src="/media/flyers/consorcio-integrado-2.png" width={1024} />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/82 via-slate-950/18 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="rounded-[1.5rem] border border-white/15 bg-slate-950/35 p-5 backdrop-blur-md">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-200">{homeContent.heroPanelEyebrow}</p>
                    <p className="mt-3 text-2xl font-semibold text-white">{homeContent.heroPanelTitle}</p>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-5">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Portales principales del sistema</p>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">Cada imagen resume como opera Comunitaria para administracion, residentes y seguridad.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {roleCards.map((card) => (
                <article className="glass-panel overflow-hidden rounded-[2rem] p-3" key={card.title}>
                  <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/90">
                    <Image alt={card.alt} className="h-72 w-full object-cover" height={1024} src={card.image} width={1024} />
                    <div className="space-y-3 p-5">
                      <p className="text-sm uppercase tracking-[0.22em] text-slate-500">{card.title}</p>
                      <p className="text-xl font-semibold text-slate-950">{card.description}</p>
                      <p className="text-sm leading-7 text-slate-600">{card.summary}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-5">
            <div className="max-w-4xl space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{homeContent.modulesSectionEyebrow}</p>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">{homeContent.modulesSectionTitle}</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {homeContent.modules.map((card) => (
                <article className="glass-panel overflow-hidden rounded-[2rem] p-3" key={card.title}>
                  <button
                    aria-controls={`landing-topic-${card.id}`}
                    aria-expanded={expandedTopic === card.id}
                    className="w-full overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/90 text-left"
                    onClick={() => setExpandedTopic((current) => current === card.id ? "" : card.id)}
                    type="button"
                  >
                    <Image alt={card.alt} className="h-64 w-full object-cover" height={1024} src={card.image} width={1024} />
                    <div className="space-y-3 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-lg font-semibold text-slate-950">{card.title}</p>
                        <span className="status-badge status-badge--neutral">{expandedTopic === card.id ? "Abierto" : "Ver mas"}</span>
                      </div>
                      <p className="text-sm leading-7 text-slate-600">{card.description}</p>
                      <p className="text-sm font-semibold leading-7 text-slate-800">{card.summary}</p>
                      {expandedTopic === card.id ? (
                        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 p-4" id={`landing-topic-${card.id}`}>
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.detailTitle}</p>
                          <div className="mt-3 grid gap-3 text-sm leading-7 text-slate-700">
                            {card.details.map((detail) => <p key={detail}>{detail}</p>)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>

        <PlatformPublicFooter />
      </main>

      {welcomeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-sm">
          <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/20 bg-white shadow-2xl lg:grid-cols-[0.82fr_1.18fr]">
            <div className="bg-slate-100 p-4 sm:p-5">
              <div className="relative min-h-[16rem] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm lg:min-h-[19rem]">
                <Image alt="Flyer de bienvenida Comunitaria" className="absolute inset-0 h-full w-full object-cover" fill priority sizes="(max-width: 1024px) 100vw, 42vw" src={welcomeFlyer} />
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5 p-6 sm:p-8 lg:p-10">
              <p className="text-xs uppercase tracking-[0.32em] text-sky-800">{homeContent.welcomeEyebrow}</p>
              <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">{homeContent.welcomeTitle}</h2>
              <p className="text-base leading-8 text-slate-600">{homeContent.welcomeDescription}</p>
              <div className="flex flex-wrap gap-3">
                <Link className="button-primary" href="/auth" onClick={closeWelcome}>
                  Ingresar
                </Link>
                <button className="button-secondary" onClick={closeWelcome} type="button">
                  Seguir viendo
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}