"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { PLATFORM_PUBLIC_SETTINGS_STORAGE_KEY, loadPlatformSettingsCompat, type PlatformSettingsCompatRow } from "@/lib/platform-schema-compat";

function readPreviewSettings() {
  try {
    const raw = window.localStorage.getItem(PLATFORM_PUBLIC_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PlatformSettingsCompatRow;
  } catch {
    return null;
  }
}

export function PlatformPublicFooter() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const [settings, setSettings] = useState<PlatformSettingsCompatRow | null>(null);

  useEffect(() => {
    if (!configured || !supabase) {
      return;
    }

    let ignore = false;

    const load = async () => {
      const preview = readPreviewSettings();
      if (!ignore && preview) {
        setSettings(preview);
      }

      const result = await loadPlatformSettingsCompat(supabase);

      if (!ignore) {
        setSettings((current) => result.error ? current : result.data);
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
    { label: "LinkedIn", href: settings?.linkedin_url },
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