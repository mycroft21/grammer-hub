#!/usr/bin/env node
/**
 * 데모 데이터 주입 — 실제 API 키 없이 기록 그래프와 학습 수집 화면이 어떻게 보이는지 확인용.
 *
 *   node tools/seed-demo.mjs              # 8주치 데모 데이터 추가
 *   node tools/seed-demo.mjs --weeks 4    # 기간 지정
 *   node tools/seed-demo.mjs --clear      # 데모 데이터만 삭제(실제 데이터는 건드리지 않음)
 *   node tools/seed-demo.mjs --db path    # DB 경로 지정 (기본 apps/web/data/grammer.db)
 *
 * 모든 행의 id가 `demo-`로 시작하므로 --clear로 정확히 되돌릴 수 있다.
 * 실제 사용 기록과 섞이면 학습 신호가 오염되므로, 실제 교정을 시작하기 전에 --clear를 권한다.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : (args[i + 1] ?? true); };
const has = (n) => args.includes(n);
const DB_PATH = resolve(String(flag("--db", new URL("../apps/web/data/grammer.db", import.meta.url).pathname)));
const WEEKS = Math.max(1, Math.min(26, Number(flag("--weeks", 8))));
const P = "demo-";

if (!existsSync(DB_PATH)) {
  console.error(`데이터베이스가 없습니다: ${DB_PATH}\n앱을 한 번 실행해 생성한 뒤 다시 시도하세요 (pnpm dev 또는 pnpm build && pnpm start).`);
  process.exit(1);
}
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const clear = () => {
  const t = db.transaction(() => {
    const n = {
      feedback: db.prepare("delete from feedback_events where id like ? or run_id like ?").run(`${P}%`, `${P}%`).changes,
      finals: db.prepare("delete from run_finals where run_id like ?").run(`${P}%`).changes,
      suggestions: db.prepare("delete from suggestions where id like ? or run_id like ?").run(`${P}%`, `${P}%`).changes,
      runs: db.prepare("delete from correction_runs where id like ?").run(`${P}%`).changes,
      drafts: db.prepare("delete from drafts where id like ?").run(`${P}%`).changes,
      samples: db.prepare("delete from writing_samples where id like ?").run(`${P}%`).changes,
    };
    return n;
  });
  const n = t();
  console.log(`데모 데이터를 삭제했습니다: 실행 ${n.runs} · 제안 ${n.suggestions} · 피드백 ${n.feedback} · 샘플 ${n.samples}`);
};

if (has("--clear")) { clear(); process.exit(0); }

const user = db.prepare("select id from users limit 1").get();
if (!user) { console.error("사용자가 없습니다. 앱을 한 번 열어 초기화한 뒤 다시 시도하세요."); process.exit(1); }
const profiles = db.prepare("select id, channel, audience from situation_profiles where user_id = ?").all(user.id);
if (profiles.length === 0) { console.error("프로필이 없습니다. 앱을 한 번 열어 기본 프로필을 만든 뒤 다시 시도하세요."); process.exit(1); }

/** 실제로 나올 법한 한국어 교정 예시. 카테고리 분포가 그래프에서 의미를 갖도록 구성. */
const EDITS = [
  { cat: "SPELLING", sev: "error", from: "보내드릴께요", to: "보내드릴게요", why: "'-ㄹ게요'가 표준 표기입니다(한글 맞춤법 제53항).", accept: 0.95 },
  { cat: "SPELLING", sev: "error", from: "됬습니다", to: "됐습니다", why: "'되었습니다'의 준말은 '됐습니다'입니다.", accept: 0.95 },
  { cat: "SPACING", sev: "error", from: "할수있습니다", to: "할 수 있습니다", why: "의존명사 '수'는 앞말과 띄어 씁니다.", accept: 0.92 },
  { cat: "SPACING", sev: "error", from: "확인부탁드립니다", to: "확인 부탁드립니다", why: "명사와 동사는 띄어 씁니다.", accept: 0.9 },
  { cat: "GRAMMAR", sev: "error", from: "자료을", to: "자료를", why: "받침 없는 체언 뒤에는 '를'을 씁니다.", accept: 0.95 },
  { cat: "PUNCTUATION", sev: "warning", from: "팀장님 어제", to: "팀장님, 어제", why: "호칭 뒤에는 쉼표를 씁니다.", accept: 0.7 },
  { cat: "HONORIFIC", sev: "error", from: "커피 나오셨습니다", to: "커피 나왔습니다", why: "사물에 '-시-'를 쓰는 것은 과잉 존대입니다.", accept: 0.9 },
  { cat: "HONORIFIC", sev: "error", from: "말씀이 계시겠습니다", to: "말씀하시겠습니다", why: "간접 높임에는 '있으시다'를 씁니다.", accept: 0.85 },
  { cat: "REGISTER", sev: "style", from: " ㅎㅎ", to: "", why: "상급자 채널 격식 기준으로 이모티콘성 표현을 제거합니다.", accept: 0.6 },
  { cat: "REGISTER", sev: "style", from: "근데", to: "다만", why: "보고 문서에서는 구어체 접속사를 피합니다.", accept: 0.65 },
  { cat: "CONCISENESS", sev: "style", from: "부탁드리겠습니다", to: "부탁드립니다", why: "'-겠-'은 불필요한 완곡 표현입니다.", accept: 0.35 },
  { cat: "CONCISENESS", sev: "style", from: "확인해 주시기 바랍니다", to: "확인 부탁드립니다", why: "더 짧게 쓸 수 있습니다.", accept: 0.4 },
  { cat: "WORD_CHOICE", sev: "style", from: "이슈를 resolve 했습니다", to: "이슈를 해결했습니다", why: "불필요한 외래어입니다.", accept: 0.75 },
  { cat: "CLARITY", sev: "warning", from: "보내드릴게요", to: "오늘 오후 3시까지 보내드릴게요", why: "시점이 없어 수신자가 재질문할 수 있습니다.", accept: 0.55 },
  { cat: "TONE", sev: "style", from: "왜 아직 안 됐나요?", to: "진행 상황을 공유해 주실 수 있을까요?", why: "상급자 채널에서 추궁으로 읽힐 수 있습니다.", accept: 0.5 },
];

const DRAFTS = [
  "팀장님 어제 말씀하신 정산 자료 정리해서 보내드릴께요. 확인부탁드립니다.",
  "내일 회의 자료는 오전까지 공유 가능할것 같습니다 ㅎㅎ",
  "정산 오류 건은 오늘 중으로 처리 됬습니다. 추가 확인 부탁드리겠습니다.",
  "근데 이 부분은 담당자 확인이 필요해서 시간이 좀 걸릴것 같습니다.",
  "요청하신 자료을 첨부합니다. 검토 후 회신 부탁드리겠습니다.",
];

const SAMPLES = [
  { text: "안녕하세요 팀장님, 말씀주신 정산 건은 오늘 오후까지 정리해서 공유드리겠습니다. 추가로 확인이 필요한 부분은 바로 알려드릴게요. 감사합니다.", channel: "messenger", audience: "boss" },
  { text: "고객님 안녕하세요. 문의주신 결제 오류 건 확인했습니다. 해당 거래는 정상 취소 처리되었으며, 환불은 영업일 기준 3일 이내에 완료될 예정입니다. 불편을 드려 죄송합니다.", channel: "email", audience: "customer" },
  { text: "이번 주 정산 배치 작업 결과 공유드립니다. 총 1,240건 중 3건이 실패했고 원인은 가맹점 계좌 정보 불일치였습니다. 해당 건은 담당자에게 개별 안내했습니다.", channel: "report", audience: "boss" },
];

const WEEK = 7 * 86400_000;
const now = Date.now();
/** 수락률이 주차마다 조금씩 오르도록(학습이 되는 것처럼) 만들되 흔들림을 준다. */
const trend = (i, total) => 0.45 + (0.3 * i) / Math.max(1, total - 1) + (Math.random() - 0.5) * 0.08;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const stmt = {
  draft: db.prepare("insert into drafts (id,user_id,profile_id,text_nfc,text_masked,mask_map,text_hash,lang,created_at) values (?,?,?,?,?,?,?,?,?)"),
  run: db.prepare("insert into correction_runs (id,draft_id,level,provider,model,prompt_version,profile_version_id,input_tokens,cached_tokens,cache_write_tokens,output_tokens,cost_usd,ttfb_ms,latency_ms,status,error_code,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"),
  sug: db.prepare("insert into suggestions (id,run_id,kind,start,end,original,replacement,category,severity,reason,rule_ref,confidence,alt_index,alt_label,resolve_method,dropped,drop_reason) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"),
  fb: db.prepare("insert into feedback_events (id,run_id,suggestion_id,action,final_text,chosen_index,rejected_indexes,created_at) values (?,?,?,?,?,?,?,?)"),
  final: db.prepare("insert into run_finals (run_id,final_text,copied_at) values (?,?,?)"),
  sample: db.prepare("insert into writing_samples (id,user_id,text,chars,channel,audience,note,created_at) values (?,?,?,?,?,?,?,?)"),
};

let nRuns = 0, nSug = 0, nFb = 0, nEdit = 0;

const seed = db.transaction(() => {
  for (const [i, s] of SAMPLES.entries()) {
    stmt.sample.run(`${P}s${i}`, user.id, s.text, s.text.length, s.channel, s.audience, "데모 데이터", now - (SAMPLES.length - i) * 86400_000);
  }

  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekAcc = trend(WEEKS - 1 - w, WEEKS);
    const runsThisWeek = rint(2, 6);
    for (let r = 0; r < runsThisWeek; r++) {
      const at = now - w * WEEK + r * rint(2, 20) * 3600_000 - rint(0, 6) * 3600_000;
      if (at > now) continue;
      const id = `${P}r${nRuns++}`;
      const draftId = `${P}d${nRuns}`;
      const profile = pick(profiles);
      const level = pick(["L1", "L2", "L2", "L2", "L3"]);
      const text = pick(DRAFTS);
      const cachedTokens = Math.random() < 0.65 ? rint(2200, 2600) : 0;
      const inputTokens = cachedTokens > 0 ? rint(700, 1100) : rint(2900, 3600);
      const outputTokens = level === "L3" ? rint(900, 1500) : rint(220, 520);
      const costUsd = (inputTokens * 2 + cachedTokens * 0.2 + outputTokens * 10) / 1e6;
      const latency = level === "L3" ? rint(3200, 6200) : rint(1400, 3400);

      stmt.draft.run(draftId, user.id, profile.id, text, text, "{}", "demo", "ko", at);
      stmt.run.run(id, draftId, level, "cloud", "claude-sonnet-5", "0.1.0", null, inputTokens, cachedTokens, 0, outputTokens, costUsd, Math.round(latency * 0.3), latency, "ok", null, at);

      const picked = [...EDITS].sort(() => Math.random() - 0.5).slice(0, rint(2, 5));
      let accepted = 0;
      picked.forEach((e, k) => {
        const sid = `${P}${id}:e${k}`;
        stmt.sug.run(sid, id, "edit", k * 10, k * 10 + e.from.length, e.from, e.to, e.cat, e.sev, e.why, null, 0.8 + Math.random() * 0.19, null, null, "exact", 0, null);
        nSug++;
        const accept = Math.random() < e.accept * (0.75 + weekAcc * 0.5);
        stmt.fb.run(`${P}f${nFb++}`, id, sid, accept ? "accept" : "reject", null, null, null, at + 60_000);
        if (accept) accepted++;
      });

      if (level === "L3") {
        ["더 정중", "더 간결", "더 친근"].forEach((label, k) => {
          stmt.sug.run(`${P}${id}:rw${k}`, id, "rewrite", null, null, null, `${text} (${label})`, null, null, "데모 대안", null, null, k, label, null, 0, null);
          nSug++;
        });
        if (Math.random() < 0.6) stmt.fb.run(`${P}f${nFb++}`, id, null, "prefer", null, rint(0, 2), "[]", at + 90_000);
      }

      // 복사 + 일부는 직접 수정(가장 강한 학습 신호)
      const edited = Math.random() < 0.3;
      const finalText = edited ? `${text} 확인 부탁드립니다.` : text;
      stmt.final.run(id, finalText, at + 120_000);
      if (edited) { stmt.fb.run(`${P}f${nFb++}`, id, null, "edit", finalText, null, null, at + 120_000); nEdit++; }
      void accepted;
    }
  }
});

seed();
console.log(`데모 데이터를 넣었습니다 (${WEEKS}주치)
  교정 실행 ${nRuns}회 · 제안 ${nSug}개 · 피드백 ${nFb}건 (직접 수정 ${nEdit}건) · 글 샘플 ${SAMPLES.length}개
  DB: ${DB_PATH}
  되돌리기: node tools/seed-demo.mjs --clear`);
