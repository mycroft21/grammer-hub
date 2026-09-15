# 로컬 LLM 지연 모델. 속도 수치(tok/s)는 리서치 실측치로 채운다.
# decode tok/s ≈ 대역폭(GB/s) × 효율 / 가중치(GB). 4bit 기준 가중치 GB ≈ 파라미터(B) × 0.58 (+임베딩)
CHIPS = {  # name: (memory bandwidth GB/s, prefill tok/s per 1B params 근사, decode 효율)
  "M2 Pro 32GB": (200, 1400, 0.65),
  "M4 Pro 32GB": (273, 2200, 0.70),
  "M3 Max 36GB": (400, 2600, 0.70),
  "M4 Max 36GB": (546, 3600, 0.72),
}
MODELS = {  # name: (active params B, 토큰당 읽는 가중치 GB at 4bit, 총 가중치 GB)
  "4B (Gemma/Qwen 4B급)":   (4, 2.6, 2.6),
  "12B (Gemma 12B급)":      (12, 7.5, 7.5),
  "14B (Qwen 14B급)":       (14, 8.5, 8.5),
  "27B (Gemma 27B급)":      (27, 16.5, 16.5),
  "30B-A3B MoE (Qwen3)":    (3, 2.4, 17.5),
  "32B (EXAONE/Qwen 32B)":  (32, 19.5, 19.5),
}
# 워크로드: 고정 prefix(2,500)는 KV 캐시 상주 → prefill 제외. 동적부 = 예시/프로필/사전 900 + 초안
WORK = {
  "L2 300자 (edits JSON만, 교정문 미포함)": (900+300, 250),
  "L2 300자 (교정문 포함)":                 (900+300, 550),
  "L3 300자 (리라이트 3안)":                (900+300, 1400),
  "L2 1000자 (edits JSON만)":               (900+1000, 450),
}
def speeds(chip, model):
    bw, pf_per_b, eff = CHIPS[chip]; act, gb, total = MODELS[model]
    prefill = pf_per_b * 12 / act      # 활성 파라미터에 반비례
    decode = bw * eff / gb             # 대역폭 / 토큰당 읽는 가중치
    return prefill, decode
print("| 칩 | 모델 | prefill tok/s | decode tok/s | " + " | ".join(WORK) + " |")
print("|---|---|---:|---:|" + "---:|"*len(WORK))
for chip in CHIPS:
    for model in MODELS:
        pf, dc = speeds(chip, model)
        cells = [f"{(i/pf + o/dc):.1f}s" for i,o in WORK.values()]
        print(f"| {chip} | {model} | {pf:,.0f} | {dc:.0f} | " + " | ".join(cells) + " |")
