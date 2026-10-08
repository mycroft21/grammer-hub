import "server-only";
import { DEMO_TICKET, DEMO_TICKET_TERSE, jiraIssueToTicket, parseIssueKey, type Ticket } from "@grammer-hub/core";
import { env } from "./env";
import { jiraGet, jiraMode } from "./jira-oauth";

// 캐시 키에 사람을 넣는다 — 이슈 키만 쓰면 A가 가져온 티켓을 볼 권한이 없는 B도 10분 동안 받는다
const cache = new Map<string, { at: number; ticket: Ticket }>();
const TTL = 10 * 60_000;

/** 공용 토큰 방식이 켜졌는지(단일 사용자 모드 전용). 사람별 연결 여부는 jiraStatus(userId). */
export const jiraConfigured = (): boolean => jiraMode().mode !== "off";

const FIELDS = "summary,description,issuetype,status,priority,labels,components,comment,attachment,issuelinks,reporter,assignee,creator";
type Fetched = { ok: true; ticket: Ticket } | { ok: false; status: number; message: string; code?: "jira_not_connected" };

/**
 * Jira REST v3로 이슈를 가져와 Ticket으로 정규화한다. 10분 캐시(의도 정리 → 생성 사이에 두 번 부르지 않게, 사람별).
 * 로그인 모드는 그 사람의 OAuth 연결로, 단일 사용자 모드는 .env 토큰으로. DEMO-* 키는 연결 없이 데모 티켓(E2E·체험용).
 */
export async function fetchTicket(input: string, userId: string): Promise<Fetched> {
  const key = parseIssueKey(input);
  if (!key) return { ok: false, status: 400, message: "이슈 키를 찾지 못했습니다. EP-1174 또는 Jira URL을 입력하세요." };
  if (key === "DEMO-2") return { ok: true, ticket: DEMO_TICKET_TERSE };
  if (key.startsWith("DEMO-")) return { ok: true, ticket: { ...DEMO_TICKET, key } };
  const ck = `${userId}:${key}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return { ok: true, ticket: hit.ticket };
  const m = jiraMode();
  if (m.mode === "off") return { ok: false, status: 503, message: `Jira 연동이 꺼져 있습니다 — ${m.reason}` };
  const path = `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${FIELDS}`;
  let res: Response, site: string;
  if (m.mode === "oauth") {
    const r = await jiraGet(userId, path);
    if (!r.ok) {
      if (r.reason === "temporary") return { ok: false, status: 502, message: `Jira 연결이 잠시 안 됩니다. 잠시 후 다시 시도하세요${r.detail ? ` (${r.detail})` : ""}` };
      return { ok: false, status: 401, code: "jira_not_connected", message: r.reason === "reconnect" ? "Jira 연결이 만료되었거나 해제되었습니다. 내 설정에서 Jira를 다시 연결하세요." : "내 설정에서 Jira를 먼저 연결하세요(내 권한으로 티켓을 봅니다)." };
    }
    res = r.res; site = r.siteUrl;
  } else {
    site = env.jiraBaseUrl.replace(/\/$/, "");
    try { res = await fetch(`${site}${path}`, { headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${env.jiraEmail}:${env.jiraApiToken}`).toString("base64")}` }, signal: AbortSignal.timeout(15_000) }); }
    catch (e) { return { ok: false, status: 502, message: `Jira 연결 실패: ${String(e)}` }; }
  }
  if (res.status === 404) return { ok: false, status: 404, message: `${key} 이슈를 찾을 수 없거나 볼 권한이 없습니다.` };
  if (res.status === 401 || res.status === 403) return { ok: false, status: 401, message: m.mode === "oauth" ? `${key}를 볼 권한이 없습니다(내 Jira 계정 기준).` : "Jira 인증 실패. JIRA_EMAIL / JIRA_API_TOKEN을 확인하세요." };
  if (!res.ok) return { ok: false, status: 502, message: `Jira 응답 ${res.status}` };
  const json = (await res.json()) as Record<string, unknown>;
  // browse 링크는 사이트 주소로(OAuth API 주소는 api.atlassian.com이라 링크로 쓸 수 없다)
  const ticket = jiraIssueToTicket(json, site);
  cache.set(ck, { at: Date.now(), ticket });
  return { ok: true, ticket };
}
