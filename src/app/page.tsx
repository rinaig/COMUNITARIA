import { Suspense } from "react";
import { HomeLanding } from "@/components/home-landing";

export default function Home() {
  return (
    <Suspense>
      <HomeLanding />
    </Suspense>
  );
}
