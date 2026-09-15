# 비용 모델: 공식 가격표(2026-06 캐시) 기반. 토큰 수는 가정치(보수적으로 한글 1자≈1토큰).
KRW = 1380.0
MODELS = {
  # name: (input, output, cache_read, cache_write5m, cache_min_tokens)
  "haiku-4.5":  (1.00, 5.00, 0.10, 1.25, 4096),
  "sonnet-5":   (2.00,10.00, 0.20, 2.50, 1024),
  "opus-5":     (5.00,25.00, 0.50, 6.25,  512),
}
# 프롬프트 구성(토큰)
FIXED_SYS   = 1500   # 고정 지침+카테고리 정의+출력 스키마 설명
PROFILE     = 1000   # 활성 스타일 규칙 스냅샷(캐시 대상, 증류 시에만 변경)
DYNAMIC     = 900    # 검색 예시 k=4 + 상황 프로필 + 개인 사전
THINK       = 300    # adaptive thinking, effort low 가정(출력 과금)
SCEN = {"슬랙(80자)":80, "이메일(400자)":400, "보고서(1500자)":1500}
def out_tokens(n, level):
    edits = min(3 + n//60, 25) * 50            # edit 카드당 ~50토큰
    if level == "L1": return n + edits + THINK
    if level == "L2": return n + edits + 120 + THINK
    return n + edits + 3*n + 200 + THINK        # L3: 리라이트 3안
def cost(model, n, level, hit):
    inp, outp, cr, cw, cmin = MODELS[model]
    prefix = FIXED_SYS + PROFILE
    cacheable = prefix >= cmin
    if cacheable:
        pre_cost = hit*prefix*cr + (1-hit)*prefix*cw
    else:
        pre_cost = prefix*inp
    dyn = (DYNAMIC + n) * inp
    o = out_tokens(n, level) * outp
    return (pre_cost + dyn + o) / 1e6
def table(hit, title):
    print(f"\n### {title} (캐시 적중률 {int(hit*100)}%)\n")
    print("| 모델 | 강도 | " + " | ".join(SCEN) + " |")
    print("|---|---|" + "---:|"*len(SCEN))
    for m in MODELS:
        for lv in ["L1","L3"]:
            row = [f"${cost(m,n,lv,hit):.4f} (₩{cost(m,n,lv,hit)*KRW:.0f})" for n in SCEN.values()]
            print(f"| {m} | {lv} | " + " | ".join(row) + " |")
table(0.0, "건당 비용, 캐시 없음")
table(0.6, "건당 비용, 캐시 적용")
# 월간 시나리오
print("\n### 월간 LLM 비용 (사용자 1인)\n")
mix = [("슬랙(80자)","L2",0.6),("이메일(400자)","L3",0.3),("보고서(1500자)","L3",0.1)]  # 요청 비중
def per_req(model, hit):
    return sum(w*cost(model,SCEN[s],lv,hit) for s,lv,w in mix)
DISTILL = 0.11*4.3  # 주1회 Opus5 Batch 증류: (30k in*$5 + 3k out*$25)/1e6 *0.5 ≈ $0.11
print("| 사용 패턴 | 요청/월 | haiku-4.5 | sonnet-5 | opus-5 |")
print("|---|---:|---:|---:|---:|")
for label, rpm in [("개인 보통 (15회/일)",330),("개인 헤비 (40회/일)",880),("제품 활성 사용자 1인 (10회/일)",220),("실시간 타이핑 모드 (150회/일, L1만)",3300)]:
    cells=[]
    for m in MODELS:
        if "실시간" in label:
            c = rpm*cost(m,80,"L1",0.6)
        else:
            c = rpm*per_req(m,0.6) + DISTILL
        cells.append(f"${c:.2f} (₩{c*KRW:,.0f})")
    print(f"| {label} | {rpm} | " + " | ".join(cells) + " |")
# 제품 규모 & 손익
print("\n### 범용 제품 손익 (sonnet-5 기준, 활성 사용자 220회/월, 증류 포함)\n")
u_cost = 220*per_req("sonnet-5",0.6) + DISTILL
u_cost_h = 220*per_req("haiku-4.5",0.6) + DISTILL
print(f"활성 사용자 1인당 LLM 원가: sonnet-5 ${u_cost:.2f}/월, haiku-4.5 ${u_cost_h:.2f}/월\n")
print("| 활성 사용자 | LLM(sonnet) | 인프라 | 총원가 | 매출@₩9,900 | 매출@$12 | 마진@₩9,900 |")
print("|---:|---:|---:|---:|---:|---:|---:|")
for users, infra in [(1,0),(100,45),(1000,150),(10000,900)]:
    llm = users*u_cost; total=llm+infra
    rev_k = users*9900/KRW; rev_12 = users*12
    print(f"| {users:,} | ${llm:,.0f} | ${infra} | ${total:,.0f} | ${rev_k:,.0f} | ${rev_12:,.0f} | {(rev_k-total)/rev_k*100 if rev_k else 0:.0f}% |")
print("\n무료 사용자(전환율 5% 가정) 포함 시 유료 1인이 무료 19인의 원가를 부담:")
print(f"유료 1인당 부담 원가 = ${u_cost*20:.2f} (sonnet) / ${u_cost_h*20:.2f} (haiku) vs 매출 ₩9,900≈${9900/KRW:.2f}")
