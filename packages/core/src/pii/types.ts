/** 감지·마스킹 대상 PII 종류. 겹침 해소 우선순위는 detect.ts의 PRIORITY 참고. */
export type PiiKind = "EMAIL" | "PHONE" | "CARD" | "ACCT" | "RRN" | "DICT";

export const PII_KINDS: readonly PiiKind[] = ["EMAIL", "PHONE", "CARD", "ACCT", "RRN", "DICT"];

/**
 * 마스킹된 텍스트 안에서 대체어(토큰)가 차지하는 구간.
 * `start`/`end`는 **마스킹된** 문자열의 UTF-16 코드 유닛 오프셋. `original`은 NFC 원문에서 잘라낸 값.
 */
export interface MaskedSpan {
  start: number;
  end: number;
  kind: PiiKind;
  token: string;
  original: string;
}

export interface MaskResult {
  /** 마스킹된 텍스트(NFC) */
  masked: string;
  /** 등장 순서대로 정렬된 대체 구간. 같은 원문 값이 여러 번 나오면 같은 token으로 여러 span이 생긴다. */
  spans: MaskedSpan[];
  /** token(대체어) → 원문 값 */
  map: Map<string, string>;
}

export interface MaskOptions {
  /** 사용자 사전 항목(고객사명 등). 정확 일치, 긴 항목 우선. */
  dictionary?: { term: string }[];
  /** 이 종류가 감지되면 PiiBlockedError를 던진다. 기본 빈 값. */
  block?: PiiKind[];
  /** "natural"(기본): 자연어 대체어. "token": `⟦PII:KIND:n⟧` */
  style?: "token" | "natural";
}
