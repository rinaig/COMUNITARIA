import { PortalShell } from "@/components/portal-shell";
import { PortalAccessGuard } from "@/components/portal-access-guard";
import { PlatformLiveConsole } from "@/components/platform-live-console";

export default function PlatformPage() {
  return (
    <PortalShell role="superadmin">
      <PortalAccessGuard requiredRole="superadmin">
        <PlatformLiveConsole />
      </PortalAccessGuard>
    </PortalShell>
  );
}