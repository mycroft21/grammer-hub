import { listProfiles } from "@grammer-hub/db";
import { Editor } from "@/components/editor/Editor";
import { getDb, getUser } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profiles = listProfiles(getDb(), getUser().id);
  const sp = await searchParams;
  const q = typeof sp["profile"] === "string" ? sp["profile"] : undefined;
  const initialProfileId = profiles.some((p) => p.id === q) ? q : undefined;
  return <Editor profiles={profiles} defaultProvider={env.defaultProvider} {...(initialProfileId ? { initialProfileId } : {})} />;
}
