import { notFound } from "next/navigation";
import { DemoPortalExperience } from "@/components/demo-portal-experience";
import { isDemoRole, type DemoRole } from "@/lib/demo-mode";

type DemoPortalPageProps = {
  params: Promise<{ role: string }>;
};

export function generateStaticParams() {
  return ["admin", "residente", "seguridad"].map((role) => ({ role }));
}

export default async function DemoPortalPage({ params }: DemoPortalPageProps) {
  const { role } = await params;

  if (!isDemoRole(role)) {
    notFound();
  }

  return <DemoPortalExperience role={role as DemoRole} />;
}