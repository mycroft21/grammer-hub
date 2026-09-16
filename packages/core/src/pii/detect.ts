import type { PiiKind } from "./types";

export interface DetectedSpan {
  start: number;
  end: number;
  kind: PiiKind;
}

export interface DetectOptions {
  dictionary?: { term: string }[];
}

/** 겹침 해소 시 같은 길이면 이 순서(작을수록 우선) */
export const PRIORITY: Record<PiiKind, number> = {
  RRN: 0,
  CARD: 1,
  PHONE: 2,
  EMAIL: 3,
  ACCT: 4,
  DICT: 5,
};

// 실용적 이메일 정규식(RFC 근사). 로컬파트/도메인에 한글은 허용하지 않아 "…@x.com로" 같은 조사 결합에서 멈춘다.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// 휴대전화(하이픈 선택), 유선(하이픈 필수), +82 국제형(구분자 하이픈/공백 선택, 선행 0 선택)
const PHONE_RE =
  /(?<!\d)(?:\+82[-\s]?0?\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}|01[016789]-?\d{3,4}-?\d{4}|0\d{1,2}-\d{3,4}-\d{4})(?!\d)/g;
const MOBILE_PLAIN_RE = /^01[016789]\d{7,8}$/;

// 13~19자리, 자리 사이 공백/하이픈 1개 허용. 구분자 혼용은 코드에서 거부하고 Luhn 검증.
const CARD_RE = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;

const ACCT_HYPHEN_RE = /(?<![\d+-])\d{2,6}-\d{2,6}-\d{2,8}(?![\d-])/g;
const ACCT_PLAIN_RE = /(?<![\d+-])\d{10,14}(?![\d-])/g;
// 스펙의 계좌 패턴은 ISO 날짜(2024-01-15)도 삼킨다. 업무 메시지에 흔하고 사실 보존 검사에 해로우므로 유효한 날짜 모양만 제외.
const ISO_DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

const RRN_RE = /(?<![\d-])\d{6}-?[1-8]\d{6}(?![\d-])/g;
const RRN_PLAIN_RE = /^\d{6}[1-8]\d{6}$/;

/** Luhn 체크섬. 숫자만 들어온다고 가정. */
export function luhn(digits: string): boolean {
  if (digits.length === 0 || !/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function collect(text: string, re: RegExp, kind: PiiKind, accept?: (m: string) => boolean): DetectedSpan[] {
  const out: DetectedSpan[] = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const s = m[0];
    if (accept && !accept(s)) continue;
    out.push({ start: m.index, end: m.index + s.length, kind });
  }
  return out;
}

export function detectEmail(text: string): DetectedSpan[] {
  return collect(text, EMAIL_RE, "EMAIL");
}

export function detectPhone(text: string): DetectedSpan[] {
  return collect(text, PHONE_RE, "PHONE");
}

export function detectCard(text: string): DetectedSpan[] {
  return collect(text, CARD_RE, "CARD", (s) => {
    const seps = new Set(s.replace(/\d/g, ""));
    if (seps.size > 1) return false; // 공백·하이픈 혼용은 카드로 보지 않는다
    const digits = s.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  });
}

export function detectAcct(text: string): DetectedSpan[] {
  const hyphen = collect(text, ACCT_HYPHEN_RE, "ACCT", (s) => !ISO_DATE_RE.test(s));
  const plain = collect(text, ACCT_PLAIN_RE, "ACCT", (s) => {
    if (MOBILE_PLAIN_RE.test(s)) return false;
    if (RRN_PLAIN_RE.test(s)) return false;
    if (s.length >= 13 && luhn(s)) return false;
    return true;
  });
  return [...hyphen, ...plain];
}

export function detectRrn(text: string): DetectedSpan[] {
  return collect(text, RRN_RE, "RRN");
}

export function detectDict(text: string, dictionary: { term: string }[] | undefined): DetectedSpan[] {
  if (!dictionary || dictionary.length === 0) return [];
  const terms = [...new Set(dictionary.map((d) => d.term.normalize("NFC")).filter((t) => t.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  const out: DetectedSpan[] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i < 0) break;
      out.push({ start: i, end: i + term.length, kind: "DICT" });
      from = i + term.length;
    }
  }
  return out;
}

/** 겹치는 후보 중 긴 것 우선, 같은 길이면 PRIORITY, 그다음 앞선 위치. 결과는 start 오름차순. */
export function resolveOverlaps(candidates: DetectedSpan[]): DetectedSpan[] {
  const sorted = [...candidates].sort((a, b) => {
    const la = a.end - a.start;
    const lb = b.end - b.start;
    if (la !== lb) return lb - la;
    if (PRIORITY[a.kind] !== PRIORITY[b.kind]) return PRIORITY[a.kind] - PRIORITY[b.kind];
    return a.start - b.start;
  });
  const accepted: DetectedSpan[] = [];
  for (const c of sorted) {
    if (accepted.some((a) => c.start < a.end && a.start < c.end)) continue;
    accepted.push(c);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/** NFC 정규화된 텍스트에서 모든 종류를 감지하고 겹침을 해소한다. 입력은 호출자가 NFC로 넘긴다고 가정. */
export function detect(text: string, opts: DetectOptions = {}): DetectedSpan[] {
  return resolveOverlaps([
    ...detectRrn(text),
    ...detectCard(text),
    ...detectPhone(text),
    ...detectEmail(text),
    ...detectAcct(text),
    ...detectDict(text, opts.dictionary),
  ]);
}
