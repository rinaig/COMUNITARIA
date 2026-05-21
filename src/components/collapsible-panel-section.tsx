"use client";

import { useState } from "react";

type CollapsiblePanelSectionProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function CollapsiblePanelSection({ eyebrow, title, subtitle, defaultOpen = false, children, actions }: CollapsiblePanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-6 glass-panel rounded-[2rem] p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <button className="flex-1 text-left" onClick={() => setOpen((current) => !current)} type="button">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950 lg:text-3xl">{title}</h3>
              {subtitle ? <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{subtitle}</p> : null}
            </div>
            <span className="status-badge status-badge--neutral">{open ? "Ocultar" : "Expandir"}</span>
          </div>
        </button>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>

      {open ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}