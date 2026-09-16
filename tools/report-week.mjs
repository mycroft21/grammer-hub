// 주간 리포트: 최근 7일 실행 수, 비용, 캐시 적중, 수락률, 무수정 복사율. 02-feasibility.md 추정치와 대조용.
// 실행: node tools/report-week.mjs [db경로]   (기본 apps/web/data/grammer.db)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const path = process.argv[2] ?? new URL("../apps/web/data/grammer.db", import.meta.url).pathname;
const db = new Database(path, { readonly: true });
const since = Date.now() - 7 * 86400_000;
const runs = db.prepare("select count(*) n, coalesce(sum(cost_usd),0) cost, coalesce(avg(latency_ms),0) lat, coalesce(sum(cached_tokens),0) cached, coalesce(sum(input_tokens),0) input, coalesce(sum(output_tokens),0) output from correction_runs where created_at > ? and status='ok'").get(since);
const fb = db.prepare("select action, count(*) n from feedback_events where created_at > ? group by action").all(since);
const finals = db.prepare("select count(*) n from run_finals where copied_at > ?").get(since);
const untouched = db.prepare(`select count(*) n from run_finals f join correction_runs r on r.id=f.run_id where f.copied_at > ? and not exists (select 1 from feedback_events e where e.run_id=r.id and e.action='edit')`).get(since);
const byCat = db.prepare(`select s.category, sum(case when e.action='accept' then 1 else 0 end) acc, sum(case when e.action='reject' then 1 else 0 end) rej from feedback_events e join suggestions s on s.id=e.suggestion_id where e.created_at > ? and s.category is not null group by s.category order by acc+rej desc`).all(since);
const a = fb.find((x) => x.action === "accept")?.n ?? 0, r = fb.find((x) => x.action === "reject")?.n ?? 0;
console.log(`# 최근 7일`);
console.log(`실행 ${runs.n}건 · 비용 $${runs.cost.toFixed(3)} (건당 $${runs.n ? (runs.cost / runs.n).toFixed(4) : "0"}) · 평균 지연 ${(runs.lat / 1000).toFixed(1)}s`);
console.log(`토큰 입력 ${runs.input} · 캐시 ${runs.cached} (${runs.input + runs.cached ? Math.round((runs.cached / (runs.input + runs.cached)) * 100) : 0}%) · 출력 ${runs.output}`);
console.log(`수락률 ${a + r ? Math.round((a / (a + r)) * 100) : 0}% (${a}/${a + r}) · 복사 ${finals.n}건 · 무수정 복사율 ${finals.n ? Math.round((untouched.n / finals.n) * 100) : 0}%`);
for (const c of byCat) console.log(`  ${c.category.padEnd(12)} 수락 ${c.acc} / 무시 ${c.rej}`);
