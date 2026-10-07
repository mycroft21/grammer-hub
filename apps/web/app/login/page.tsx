import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { LoginCard } from "@/components/auth/LoginCard";

export const dynamic = "force-dynamic";

/** 로그인 모드에서만 존재하는 화면. 아니면 홈으로. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!env.authEnabled) redirect("/");
  const sp = await searchParams;
  const error = typeof sp["error"] === "string" ? sp["error"] : null;
  const next = typeof sp["next"] === "string" ? sp["next"] : "/";
  const host = (() => { try { return new URL(env.oidcIssuer).host; } catch { return env.oidcIssuer; } })();
  return <LoginCard error={error} next={next} issuerHost={host} />;
}
