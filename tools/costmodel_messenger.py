exec(open(__file__.replace("costmodel_messenger.py","costmodel.py")).read().split("table(0.0")[0])  # 함수/상수 재사용
SCEN = {"짧은 보고(80자)":80, "보통 보고(300자)":300, "긴 보고(1000자)":1000}
mix = [("짧은 보고(80자)","L2",0.5),("보통 보고(300자)","L2",0.4),("긴 보고(1000자)","L3",0.1)]
print("### 메신저 보고 시나리오 건당 비용 (캐시 60% 적중)\n")
print("| 모델 | 강도 | " + " | ".join(SCEN) + " |"); print("|---|---|---:|---:|---:|")
for m in MODELS:
    for lv in ["L1","L2","L3"]:
        print(f"| {m} | {lv} | " + " | ".join(f"${cost(m,n,lv,0.6):.4f} (₩{cost(m,n,lv,0.6)*KRW:.0f})" for n in SCEN.values()) + " |")
def per_req(model, hit=0.6): return sum(w*cost(model,SCEN[s],lv,hit) for s,lv,w in mix)
def hybrid(hit=0.6):  # L1/L2는 haiku, L3만 sonnet
    return sum(w*cost("haiku-4.5" if lv!="L3" else "sonnet-5",SCEN[s],lv,hit) for s,lv,w in mix)
DISTILL = 0.11*4.3
print("\n### 월간 비용 (메신저 보고 믹스: 80자 50% / 300자 40% / 1000자 10%, 주1회 증류 포함)\n")
print("| 사용 패턴 | 요청/월 | haiku-4.5 | 하이브리드(haiku L1·L2 + sonnet L3) | sonnet-5 | opus-5 |"); print("|---|---:|---:|---:|---:|---:|")
for label, rpm in [("개인 가벼움 (5회/일)",110),("개인 보통 (15회/일)",330),("개인 헤비 (40회/일)",880),("제품 활성 사용자 (10회/일)",220)]:
    vals=[rpm*per_req("haiku-4.5")+DISTILL, rpm*hybrid()+DISTILL, rpm*per_req("sonnet-5")+DISTILL, rpm*per_req("opus-5")+DISTILL]
    print(f"| {label} | {rpm} | " + " | ".join(f"${v:.2f} (₩{v*KRW:,.0f})" for v in vals) + " |")
print(f"\n평균 건당(sonnet-5): ${per_req('sonnet-5'):.4f} = ₩{per_req('sonnet-5')*KRW:.0f} / 하이브리드 ${hybrid():.4f} = ₩{hybrid()*KRW:.0f}")
u_s = 220*per_req("sonnet-5")+DISTILL; u_h = 220*hybrid()+DISTILL
print("\n### 범용 제품 손익 (활성 유료 사용자 기준, 월 220회)\n")
print("| 활성 유료 사용자 | 원가(sonnet) | 원가(하이브리드) | 인프라 | 매출@₩9,900 | 마진 sonnet | 마진 하이브리드 |"); print("|---:|---:|---:|---:|---:|---:|---:|")
for users, infra in [(100,45),(1000,150),(10000,900)]:
    rev = users*9900/KRW
    print(f"| {users:,} | ${users*u_s:,.0f} | ${users*u_h:,.0f} | ${infra} | ${rev:,.0f} | {(rev-users*u_s-infra)/rev*100:.0f}% | {(rev-users*u_h-infra)/rev*100:.0f}% |")
print(f"\n유료 1인당 원가: sonnet ${u_s:.2f}, 하이브리드 ${u_h:.2f}. 무료 티어 운영 시(무료:유료=19:1, 무료는 월 30회 제한) 유료 1인 부담 = sonnet ${u_s+19*(30*per_req('sonnet-5')):.2f}, 하이브리드 ${u_h+19*(30*hybrid()):.2f}")
