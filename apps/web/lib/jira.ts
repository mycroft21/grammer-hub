import "server-only";
import { DEMO_TICKET, DEMO_TICKET_TERSE, jiraIssueToTicket, parseIssueKey, type Ticket } from "@grammer-hub/core";
import { env } from "./env";

const cache = new Map<string, { at: number; ticket: Ticket }>();
const TTL = 10 * 60_000;

export const jiraConfigured = (): boolean => Boolean(env.jiraBaseUrl && env.jiraEmail && env.jiraApiToken);

/**
 * Jira REST v3로 이슈를 가져와 Ticket으로 정규화한다. 10분 캐시(의도 정리 → 생성 사이에 두 번 부르지 않게).
 * DEMO-* 키는 토큰 없이 데모 티켓을 돌려준다(E2E·체험용).
 */
export async function fetchTicket(input: string): Promise<{ ok: true; ticket: Ticket } | { ok: false; status: number; message: string }> {
  const key = parseIssueKey(input);
  if (!key) return { ok: false, status: 400, message: "이슈 키를 찾지 못했습니다. EP-1174 또는 Jira URL을 입력하세요." };
  if (key === "DEMO-2") return { ok: true, ticket: DEMO_TICKET_TERSE };
  if (key.startsWith("DEMO-")) return { ok: true, ticket: { ...DEMO_TICKET, key } };
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ok: true, ticket: hit.ticket };
  if (!jiraConfigured()) return { ok: false, status: 503, message: ".env에 JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN이 필요합니다 (id.atlassian.com → 보안 → API 토큰)." };
  const base = env.jiraBaseUrl.replace(/\/$/, "");
  const url = `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,issuetype,status,priority,labels,components,comment,attachment,issuelinks,reporter,assignee,creator`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${env.jiraEmail}:${env.jiraApiToken}`).toString("base64")}` }, signal: AbortSignal.timeout(15_000) });
  } catch (e) { return { ok: false, status: 502, message: `Jira 연결 실패: ${String(e)}` }; }
  if (res.status === 404) return { ok: false, status: 404, message: `${key} 이슈를 찾을 수 없거나 볼 권한이 없습니다.` };
  if (res.status === 401 || res.status === 403) return { ok: false, status: 401, message: "Jira 인증 실패. JIRA_EMAIL / JIRA_API_TOKEN을 확인하세요." };
  if (!res.ok) return { ok: false, status: 502, message: `Jira 응답 ${res.status}` };
  const json = (await res.json()) as Record<string, unknown>;
  const ticket = jiraIssueToTicket(json, base);
  cache.set(key, { at: Date.now(), ticket });
  return { ok: true, ticket };
}
