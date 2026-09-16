import { listProfiles } from "@grammer-hub/db";
import { Editor } from "@/components/editor/Editor";
import { getDb, getUser } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Home() {
  const profiles = listProfiles(getDb(), getUser().id);
  return <Editor profiles={profiles} defaultProvider={env.defaultProvider} />;
}
