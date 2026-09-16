# 로컬 LLM 지연 모델 (Apple Silicon). llama.cpp #4167 (7B Q4_0, PP512/TG128) 실측을 앵커로 스케일.
# prefill(model) = PP7B × 7 / 활성파라미터B (compute-bound), decode = 대역폭 × 0.72 / 토큰당 읽는 GB (bandwidth-bound)
CHIPS = {  # name: (대역폭 GB/s, 7B Q4 prefill tok/s 실측)
  "M2 Pro 32GB":  (200, 294),
  "M3 Pro 36GB":  (150, 342),
  "M4 Pro 32GB":  (273, 440),
  "M3 Max 36GB":  (400, 760),
  "M4 Max 36GB":  (546, 886),
  "M5 기본 32GB": (153, 1100),   # 대역폭 153GB/s. prefill은 M4 기본(~275) × Neural Accelerator 약 4배 추정
  "M5 Pro 32GB":  (307, 1621),
  "M5 Max 36GB":  (614, 3220),
}
MODELS = {  # name: (활성 B, 토큰당 읽는 GB@4bit, 총 GB)
  "Gemma 4 12B":          (12, 7.0, 7.0),
  "Gemma 4 26B-A4B (MoE)": (4, 3.0, 15.0),
  "Qwen3.8-27B":          (27, 17.0, 17.0),
  "Gemma 4 31B":          (31, 18.7, 18.7),
  "HyperCLOVA X SEED 32B": (32, 18.0, 18.0),
}
# 워크로드: 고정 prefix 2,500토큰은 KV 캐시(slot save) 상주 → prefill 제외. 동적부 900(예시·프로필·사전) + 초안(한글 1자≈1토큰)
WORK = {
  "L2 300자 edits만": (900+300, 250),
  "L2 300자 교정문 포함": (900+300, 550),
  "L3 300자 3안": (900+300, 1400),
  "L2 1000자 edits만": (900+1000, 450),
  "콜드(prefix 2.5k 재계산, L2 300자)": (2500+900+300, 250),
}
def speeds(chip, model):
    bw, pp7 = CHIPS[chip]; act, gb, _ = MODELS[model]
    return pp7*7/act, bw*0.72/gb
if __name__ == "__main__":
    print("| 칩 | 모델 | prefill tok/s | decode tok/s | " + " | ".join(WORK) + " |")
    print("|---|---|---:|---:|" + "---:|"*len(WORK))
    for chip in CHIPS:
        for model in MODELS:
            pf, dc = speeds(chip, model)
            print(f"| {chip} | {model} | {pf:,.0f} | {dc:.0f} | " + " | ".join(f"{(i/pf + o/dc):.0f}s" for i,o in WORK.values()) + " |")
