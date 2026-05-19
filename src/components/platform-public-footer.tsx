"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PlatformSettings = {
  support_email: string | null;
  support_phone: string | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
};

export function PlatformPublicFooter() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);

  useEffect(() => {
    if (!configured || !supabase) {
      return;
    }

    let ignore = false;

    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("support_email, support_phone, instagram_url, x_url, facebook_url")
        .eq("id", true)
        .maybeSingle();

      if (!ignore) {
        setSettings((data as PlatformSettings | null) ?? null);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [configured, supabase]);

  const supportEmail = settings?.support_email || "rnahueliglesias@gmail.com";
  const supportPhone = settings?.support_phone || "";
  const socialLinks = [
    { label: "Instagram", href: settings?.instagram_url },
    { label: "X", href: settings?.x_url },
    { label: "Facebook", href: settings?.facebook_url },
  ];

  return (
    <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur">
      <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex flex-wrap gap-3">
          {socialLinks.map((item) =>
            item.href ? (
              <Link className="button-secondary" href={item.href} key={item.label} target="_blank">
                {item.label}
              </Link>
            ) : (
              <span className="button-secondary opacity-60" key={item.label}>
                {item.label}
              </span>
            ),
          )}
        </div>
        <div className="text-sm leading-7 text-slate-600">
          <p>Copyright COMUNITARIA</p>
          <p>Contacto: {supportPhone || "Sin telefono configurado"} | {supportEmail}</p>
        </div>
      </div>
    </footer>
  );
}