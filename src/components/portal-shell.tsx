import Link from "next/link";
import { PortalNotificationsPanel } from "@/components/portal-notifications-panel";
import { PortalTenantSummary } from "@/components/portal-tenant-summary";
import {
  demoRoles,
  roleLabels,
  tenantSnapshot,
  type AppRole,
} from "@/lib/domain";

type PortalShellProps = {
  role?: AppRole;
  children: React.ReactNode;
};

export function PortalShell({ role, children }: PortalShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#eff6ff_0%,_#f3f4f6_40%,_#ffffff_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 lg:px-10 lg:py-8">
        <header className="glass-panel flex flex-col gap-4 rounded-[2rem] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <PortalTenantSummary fallback={tenantSnapshot} />

          <nav className="flex flex-wrap gap-3 text-sm font-medium">
            <PortalNotificationsPanel />
            <Link className="button-secondary" href="/">
              Inicio
            </Link>
            <Link className="button-secondary" href="/portal">
              Roles
            </Link>
            {demoRoles.map((item) => (
              <Link
                className={item === role ? "button-primary" : "button-secondary"}
                href={`/portal/${item}`}
                key={item}
              >
                {roleLabels[item]}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mt-6 flex-1">{children}</main>
      </div>
    </div>
  );
}