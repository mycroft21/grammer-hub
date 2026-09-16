import { describe, expect, it } from "vitest";
import {
  PiiBlockedError,
  alphaLabel,
  detect,
  detectAcct,
  detectCard,
  detectDict,
  detectEmail,
  detectPhone,
  detectRrn,
  fuzzyPattern,
  luhn,
  mapOffset,
  mapRange,
  mask,
  resolveOverlaps,
  unmask,
} from "../index";
import type { PiiKind } from "../index";

const kinds = (text: string, dictionary?: { term: string }[]) =>
  detect(text, dictionary ? { dictionary } : {}).map((s) => s.kind);
const values = (text: string, dictionary?: { term: string }[]) =>
  detect(text, dictionary ? { dictionary } : {}).map((s) => text.slice(s.start, s.end));

describe("detect: EMAIL", () => {
  it("일반 이메일과 서브도메인·플러스 주소를 찍고, 뒤에 붙은 조사는 제외한다", () => {
    expect(values("메일은 kim.cs@samsung.co.kr로 보내세요")).toEqual(["kim.cs@samsung.co.kr"]);
    expect(values("(a.b+tag@example.com)")).toEqual(["a.b+tag@example.com"]);
    expect(detectEmail("x user_1@sub.example.org.").map((s) => s.end)).toEqual([2 + "user_1@sub.example.org".length]);
  });
  it("불완전한 주소는 감지하지 않는다", () => {
    expect(detectEmail("user@")).toEqual([]);
    expect(detectEmail("@example.com")).toEqual([]);
    expect(detectEmail("user@example")).toEqual([]);
    expect(detectEmail("가나다@example.com")).toEqual([]);
  });
});

describe("detect: PHONE", () => {
  it("휴대전화(하이픈 유무), 유선, +82 형태를 감지한다", () => {
    expect(values("연락처 010-1234-5678")).toEqual(["010-1234-5678"]);
    expect(kinds("연락처 01012345678")).toEqual(["PHONE"]);
    expect(values("011-123-4567 입니다")).toEqual(["011-123-4567"]);
    expect(values("사무실 02-555-1234 / 031-123-4567")).toEqual(["02-555-1234", "031-123-4567"]);
    expect(values("+82-10-1234-5678")).toEqual(["+82-10-1234-5678"]);
    expect(values("+82 10 1234 5678")).toEqual(["+82 10 1234 5678"]);
    expect(values("+821012345678")).toEqual(["+821012345678"]);
    expect(values("+82 2 555 1234")).toEqual(["+82 2 555 1234"]);
    expect(kinds("+82-10-1234-5678")).toEqual(["PHONE"]);
  });
  it("전화가 아닌 것은 감지하지 않는다", () => {
    expect(detectPhone("2024-01-15")).toEqual([]);
    expect(detectPhone("1-234-5678")).toEqual([]);
    expect(detectPhone("0123-1234-5678")).toEqual([]); // 지역번호 최대 3자리, 휴대전화 국번도 아님
    expect(detectPhone("012-1234-5678")).toHaveLength(1); // 012는 휴대전화 국번은 아니지만 유선 형태(0+1~2자리)에는 맞는다
    expect(detectPhone("02 555 1234")).toEqual([]); // 유선은 하이픈 필수
    expect(detectPhone("9010-1234-5678")).toEqual([]); // 앞에 숫자가 붙음
  });
});

describe("detect: CARD (Luhn)", () => {
  it("Luhn 통과/실패", () => {
    expect(luhn("4242424242424242")).toBe(true);
    expect(luhn("4111111111111111")).toBe(true);
    expect(luhn("378282246310005")).toBe(true);
    expect(luhn("4242424242424241")).toBe(false);
    expect(luhn("")).toBe(false);
    expect(luhn("12a4")).toBe(false);
  });
  it("공백·하이픈 구분 카드번호를 Luhn 검증해 감지한다", () => {
    expect(kinds("카드 4242 4242 4242 4242 결제")).toEqual(["CARD"]);
    expect(kinds("카드 4242-4242-4242-4242 결제")).toEqual(["CARD"]);
    expect(kinds("카드 4242424242424242 결제")).toEqual(["CARD"]);
    expect(kinds("아멕스 3782 822463 10005")).toEqual(["CARD"]);
  });
  it("Luhn 실패, 자리수 초과·미달, 구분자 혼용은 카드로 보지 않는다", () => {
    expect(detectCard("4242 4242 4242 4241")).toEqual([]);
    expect(detectCard("42424242424242424242")).toEqual([]); // 20자리
    expect(detectCard("424242424242")).toEqual([]); // 12자리
    expect(detectCard("4242 4242-4242 4242")).toEqual([]);
    expect(detectCard("2024-01-15 010-1234-5678")).toEqual([]);
  });
});

describe("detect: ACCT", () => {
  it("하이픈 계좌와 10~14자리 평문 숫자를 감지한다", () => {
    expect(kinds("계좌 110-123-456789 입금")).toEqual(["ACCT"]);
    expect(kinds("계좌 1002-123-456789")).toEqual(["ACCT"]);
    expect(kinds("계좌 12345678901 입금")).toEqual(["ACCT"]);
    expect(kinds("계좌 110123456789 입금")).toEqual(["ACCT"]); // 12자리, Luhn 통과지만 카드 자리수 미달
  });
  it("전화·주민번호·카드 모양의 평문 숫자와 날짜는 계좌로 보지 않는다", () => {
    expect(detectAcct("01012345678")).toEqual([]);
    expect(detectAcct("9012311234567")).toEqual([]);
    expect(detectAcct("4242424242424242")).toEqual([]);
    expect(detectAcct("2024-01-15")).toEqual([]);
    expect(detect("회의는 2024-01-15 입니다")).toEqual([]);
    expect(detectAcct("123-45")).toEqual([]);
    expect(detectAcct("123456789")).toEqual([]); // 9자리
    expect(detectAcct("123456789012345")).toEqual([]); // 15자리
  });
  it("하이픈 계좌 모양이라도 전화번호는 PHONE으로 분류된다", () => {
    expect(kinds("010-1234-5678")).toEqual(["PHONE"]);
    expect(kinds("02-555-1234")).toEqual(["PHONE"]);
  });
});

describe("detect: RRN", () => {
  it("하이픈 유무 모두 감지한다", () => {
    expect(kinds("주민번호 901231-1234567")).toEqual(["RRN"]);
    expect(kinds("주민번호 9012311234567")).toEqual(["RRN"]);
    expect(values("외국인 900101-5123456.")).toEqual(["900101-5123456"]);
  });
  it("7번째 자리가 1~8이 아니면 RRN이 아니다", () => {
    expect(detectRrn("901231-9234567")).toEqual([]);
    expect(detectRrn("901231-0234567")).toEqual([]);
    expect(kinds("901231-9234567")).not.toContain("RRN");
    expect(detectRrn("1901231-1234567")).toEqual([]);
  });
});

describe("detect: DICT", () => {
  const dict = [{ term: "삼성" }, { term: "삼성전자" }, { term: "" }];
  it("긴 항목 우선 정확 일치", () => {
    expect(values("삼성전자와 삼성 미팅", dict)).toEqual(["삼성전자", "삼성"]);
    // 원시 감지기는 겹치는 후보를 모두 내고(삼성전자·삼성·삼성), detect가 겹침을 해소한다
    expect(detectDict("삼성전자와 삼성 미팅", dict)).toHaveLength(3);
    expect(detect("삼성전자와 삼성 미팅", { dictionary: dict }).map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [6, 8],
    ]);
  });
  it("사전이 없거나 일치가 없으면 빈 배열", () => {
    expect(detectDict("삼성전자", undefined)).toEqual([]);
    expect(detectDict("엘지전자", dict)).toEqual([]);
    expect(detectDict("삼 성", dict)).toEqual([]);
  });
});

describe("detect: 겹침 해소", () => {
  it("긴 스팬이 이긴다", () => {
    // 이메일 로컬파트에 전화 모양이 들어 있어도 이메일 전체가 남는다
    expect(kinds("010-1234-5678@example.com")).toEqual(["EMAIL"]);
    // 사전 항목이 더 긴 항목에 포함되면 긴 쪽만
    expect(kinds("삼성전자", [{ term: "삼성" }, { term: "삼성전자" }])).toEqual(["DICT"]);
  });
  it("같은 길이면 RRN > CARD > PHONE > EMAIL > ACCT > DICT", () => {
    // 9012311234567은 RRN 패턴이면서 Luhn 통과(13자리 카드) → RRN
    expect(luhn("9012311234567")).toBe(true);
    expect(kinds("9012311234567")).toEqual(["RRN"]);
    expect(kinds("901231-1234567")).toEqual(["RRN"]);
    // 전화 vs 계좌 하이픈 패턴 동일 스팬 → PHONE
    expect(kinds("031-123-4567")).toEqual(["PHONE"]);
    // 사전 항목이 전화번호와 같은 문자열 → PHONE
    expect(kinds("010-1234-5678", [{ term: "010-1234-5678" }])).toEqual(["PHONE"]);
    // 동일 스팬: 우선순위만으로 결정
    expect(
      resolveOverlaps([
        { start: 0, end: 5, kind: "DICT" },
        { start: 0, end: 5, kind: "ACCT" },
        { start: 9, end: 12, kind: "DICT" },
      ]),
    ).toEqual([
      { start: 0, end: 5, kind: "ACCT" },
      { start: 9, end: 12, kind: "DICT" },
    ]);
    // 같은 길이로 부분 겹침: 우선순위 높은 EMAIL이 먹고, 겹치는 ACCT·DICT는 탈락. 결과는 start 오름차순
    expect(
      resolveOverlaps([
        { start: 9, end: 12, kind: "DICT" },
        { start: 0, end: 5, kind: "DICT" },
        { start: 0, end: 5, kind: "ACCT" },
        { start: 3, end: 8, kind: "EMAIL" },
      ]),
    ).toEqual([
      { start: 3, end: 8, kind: "EMAIL" },
      { start: 9, end: 12, kind: "DICT" },
    ]);
    // 길이가 다르면 우선순위보다 길이가 먼저
    expect(resolveOverlaps([{ start: 0, end: 3, kind: "RRN" }, { start: 1, end: 6, kind: "DICT" }])).toEqual([
      { start: 1, end: 6, kind: "DICT" },
    ]);
  });
});

const SLACK_MSG =
  "김대리님, 삼성전자를 담당하는 박과장님 연락처는 010-1234-5678이고 사무실은 02-555-1234입니다. " +
  "자료는 kim.cs@samsung.co.kr로 보내주시면 삼성전자가 검토합니다.";
const DICT = [{ term: "삼성전자" }];

describe("mask", () => {
  it("기본은 자연어 대체어이며 조사가 자연스럽게 결합된다", () => {
    const r = mask(SLACK_MSG, { dictionary: DICT });
    expect(r.masked).toBe(
      "김대리님, A사를 담당하는 박과장님 연락처는 010-0000-0001이고 사무실은 010-0000-0002입니다. " +
        "자료는 user1@example.com로 보내주시면 A사가 검토합니다.",
    );
    expect(r.spans.map((s) => s.kind)).toEqual(["DICT", "PHONE", "PHONE", "EMAIL", "DICT"]);
    expect(r.spans.map((s) => s.original)).toEqual([
      "삼성전자",
      "010-1234-5678",
      "02-555-1234",
      "kim.cs@samsung.co.kr",
      "삼성전자",
    ]);
    // span 오프셋은 마스킹된 텍스트 기준
    for (const s of r.spans) expect(r.masked.slice(s.start, s.end)).toBe(s.token);
    expect([...r.map.entries()]).toEqual([
      ["A사", "삼성전자"],
      ["010-0000-0001", "010-1234-5678"],
      ["010-0000-0002", "02-555-1234"],
      ["user1@example.com", "kim.cs@samsung.co.kr"],
    ]);
  });

  it("token 스타일은 ⟦PII:KIND:n⟧ 이며 종류별로 1부터 센다", () => {
    const r = mask(SLACK_MSG, { dictionary: DICT, style: "token" });
    expect(r.masked).toBe(
      "김대리님, ⟦PII:DICT:1⟧를 담당하는 박과장님 연락처는 ⟦PII:PHONE:1⟧이고 사무실은 ⟦PII:PHONE:2⟧입니다. " +
        "자료는 ⟦PII:EMAIL:1⟧로 보내주시면 ⟦PII:DICT:1⟧가 검토합니다.",
    );
    expect(r.map.size).toBe(4);
  });

  it("같은 원문 값은 같은 대체어를 받는다(span은 등장마다, map은 값마다)", () => {
    const r = mask("010-1234-5678 그리고 다시 010-1234-5678, 다른 번호 010-9999-8888");
    expect(r.masked).toBe("010-0000-0001 그리고 다시 010-0000-0001, 다른 번호 010-0000-0002");
    expect(r.spans).toHaveLength(3);
    expect(r.map.size).toBe(2);
  });

  it("자연어 대체어가 원문에 이미 있으면 그 항목만 token 스타일로 물러난다", () => {
    const r = mask("테스트 번호 010-0000-0001 말고 실제 번호 010-1234-5678");
    expect(r.spans.map((s) => s.token)).toEqual(["⟦PII:PHONE:1⟧", "010-0000-0002"]);
    expect(r.masked).toBe("테스트 번호 ⟦PII:PHONE:1⟧ 말고 실제 번호 010-0000-0002");
    expect(r.map.get("⟦PII:PHONE:1⟧")).toBe("010-0000-0001");
  });

  it("종류별 자연어 대체어 형태", () => {
    const r = mask("4242-4242-4242-4242 / 110-123-456789 / 901231-1234567 / a@b.co", {});
    expect(r.masked).toBe("0000-0000-0000-0001 / 000-000-000001 / 000000-0000001 / user1@example.com");
    expect(r.spans.map((s) => s.kind)).toEqual(["CARD", "ACCT", "RRN", "EMAIL"]);
  });

  it("사전 대체어는 A사…Z사 다음 AA사", () => {
    expect(alphaLabel(1)).toBe("A");
    expect(alphaLabel(26)).toBe("Z");
    expect(alphaLabel(27)).toBe("AA");
    expect(alphaLabel(52)).toBe("AZ");
    expect(alphaLabel(53)).toBe("BA");
    const terms = Array.from({ length: 28 }, (_, i) => ({ term: `고객${String(i + 1).padStart(2, "0")}` }));
    const r = mask(terms.map((t) => t.term).join(" "), { dictionary: terms });
    expect(r.spans[0]?.token).toBe("A사");
    expect(r.spans[25]?.token).toBe("Z사");
    expect(r.spans[26]?.token).toBe("AA사");
    expect(r.spans[27]?.token).toBe("AB사");
  });

  it("block에 든 종류가 감지되면 PiiBlockedError, 감지되지 않으면 통과", () => {
    let caught: unknown;
    try {
      mask(SLACK_MSG, { dictionary: DICT, block: ["PHONE", "RRN", "EMAIL"] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PiiBlockedError);
    expect((caught as PiiBlockedError).kinds).toEqual<PiiKind[]>(["EMAIL", "PHONE"]);
    expect((caught as PiiBlockedError).name).toBe("PiiBlockedError");
    expect(() => mask(SLACK_MSG, { dictionary: DICT, block: ["RRN", "CARD"] })).not.toThrow();
    expect(() => mask(SLACK_MSG, { dictionary: DICT, block: [] })).not.toThrow();
  });

  it("NFD 입력도 NFC로 정규화해 같은 결과를 낸다", () => {
    const nfc = "삼성전자를 010-1234-5678 로 확인";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    const a = mask(nfc, { dictionary: DICT });
    const b = mask(nfd, { dictionary: [{ term: "삼성전자".normalize("NFD") }] });
    expect(b.masked).toBe(a.masked);
    expect(b.masked).toBe("A사를 010-0000-0001 로 확인");
    expect(b.spans).toEqual(a.spans);
    expect(b.map).toEqual(a.map);
    expect(b.masked.normalize("NFC")).toBe(b.masked);
  });

  it("PII가 없으면 원문(NFC) 그대로", () => {
    const r = mask("오늘 회의는 2024-01-15 14:00 입니다.");
    expect(r.masked).toBe("오늘 회의는 2024-01-15 14:00 입니다.");
    expect(r.spans).toEqual([]);
    expect(r.map.size).toBe(0);
  });
});

describe("unmask", () => {
  it("mask → unmask 왕복이 원문을 복원한다(자연어·토큰 모두)", () => {
    for (const style of ["natural", "token"] as const) {
      const r = mask(SLACK_MSG, { dictionary: DICT, style });
      const u = unmask(r.masked, r);
      expect(u.text).toBe(SLACK_MSG);
      expect(u.lost).toEqual([]);
    }
  });

  it("모델이 문장을 고쳐도 대체어 위치만 복원된다", () => {
    const r = mask(SLACK_MSG, { dictionary: DICT });
    const modelOut = r.masked.replace("보내주시면", "보내 주시면").replace("이고 사무실은", "이고, 사무실은");
    const u = unmask(modelOut, r);
    expect(u.text).toBe(
      "김대리님, 삼성전자를 담당하는 박과장님 연락처는 010-1234-5678이고, 사무실은 02-555-1234입니다. " +
        "자료는 kim.cs@samsung.co.kr로 보내 주시면 삼성전자가 검토합니다.",
    );
    expect(u.lost).toEqual([]);
  });

  it("퍼지: 공백·하이픈이 끼거나 빠지고 따옴표로 감싸도 복원한다", () => {
    const r = mask("연락처 010-1234-5678 와 010-9999-8888 확인", {});
    expect(r.masked).toBe("연락처 010-0000-0001 와 010-0000-0002 확인");
    const u = unmask("연락처 010 - 0000 - 0001 와 '01000000002' 확인", r);
    expect(u.text).toBe("연락처 010-1234-5678 와 '010-9999-8888' 확인");
    expect(u.lost).toEqual([]);
  });

  it("퍼지: 토큰 스타일 변형 ⟦PII:PHONE:1 ⟧ 도 복원하고, 1과 10을 혼동하지 않는다", () => {
    const phones = Array.from({ length: 10 }, (_, i) => `010-1111-${String(2000 + i)}`).join(" ");
    const r = mask(phones, { style: "token" });
    expect(r.map.size).toBe(10);
    const modelOut = r.masked.replace("⟦PII:PHONE:1⟧", "⟦PII:PHONE:1 ⟧").replace("⟦PII:PHONE:10⟧", "⟦ PII:PHONE:10 ⟧");
    const u = unmask(modelOut, r);
    expect(u.text).toBe(phones);
    expect(u.lost).toEqual([]);
  });

  it("긴 대체어부터 치환해 A사가 AA사를 깨지 않는다", () => {
    const terms = Array.from({ length: 27 }, (_, i) => ({ term: `고객${String(i + 1).padStart(2, "0")}` }));
    // 27개 항목이 모두 등장해야 27번째가 AA사를 받는다
    const src = `${terms.map((t) => t.term).join(", ")}와 계약했다. 특히 고객01과 고객27.`;
    const r = mask(src, { dictionary: terms });
    expect(r.masked.startsWith("A사, B사, C사")).toBe(true);
    expect(r.masked.endsWith("Z사, AA사와 계약했다. 특히 A사과 AA사.")).toBe(true);
    expect(r.map.get("AA사")).toBe("고객27");
    expect(r.map.get("A사")).toBe("고객01");
    const u = unmask(r.masked, r);
    expect(u.text).toBe(src);
    expect(u.lost).toEqual([]);
    // 퍼지 변형에서도 AA사가 A사 치환으로 깨지지 않는다
    expect(unmask("A 사과 AA 사 계약", r).text).toBe("고객01과 고객27 계약");
  });

  it("찾지 못한 토큰은 lost에 남고 나머지는 복원한다", () => {
    const r = mask("a@b.co 010-1234-5678");
    const u = unmask("이메일은 삭제했고 전화는 010-0000-0001 입니다", r);
    expect(u.text).toBe("이메일은 삭제했고 전화는 010-1234-5678 입니다");
    expect(u.lost).toEqual(["user1@example.com"]);
  });

  it("퍼지 패턴은 숫자 대체어가 더 긴 숫자열의 일부와 맞지 않는다", () => {
    const re = fuzzyPattern("010-0000-0001");
    expect(re.test("x 010 0000 0001 y")).toBe(true);
    expect(fuzzyPattern("010-0000-0001").test("9010-0000-0001")).toBe(false);
    expect(fuzzyPattern("010-0000-0001").test("010-0000-00012")).toBe(false);
    expect(fuzzyPattern("user1@example.com").test("user10@example.com")).toBe(false);
    expect(fuzzyPattern("user1@example.com").test("user1 @ example.com")).toBe(true);
  });
});

describe("mapOffset / mapRange", () => {
  //          0123456789012345
  // 원문:    메일 a@b.co 로 확인        (a@b.co = [3,9), 확인 = [12,14))
  // 마스킹:  메일 user1@example.com 로 확인   (토큰 = [3,20), 확인 = [23,25))
  const src = "메일 a@b.co 로 확인";
  const r = mask(src);

  it("전제: 토큰 길이가 원문과 다르다", () => {
    expect(r.masked).toBe("메일 user1@example.com 로 확인");
    expect(r.spans[0]).toMatchObject({ start: 3, end: 20 });
    expect(src.indexOf("확인")).toBe(12);
    expect(r.masked.indexOf("확인")).toBe(23);
  });

  it("토큰 앞 오프셋은 그대로", () => {
    expect(mapOffset(0, r)).toBe(0);
    expect(mapOffset(2, r)).toBe(2);
    expect(mapOffset(3, r)).toBe(3); // 토큰 시작 == 원문 값 시작
  });

  it("토큰 뒤 오프셋은 길이 차이만큼 이동", () => {
    expect(mapOffset(20, r)).toBe(9); // 토큰 끝 == 원문 값 끝
    expect(mapOffset(23, r)).toBe(12);
    expect(mapOffset(25, r)).toBe(14);
    expect(mapOffset(r.masked.length, r)).toBe(src.length);
  });

  it("토큰 내부 오프셋은 bias에 따라 원문 값의 시작/끝으로 붙는다", () => {
    expect(mapOffset(10, r)).toBe(3);
    expect(mapOffset(10, r, "start")).toBe(3);
    expect(mapOffset(10, r, "end")).toBe(9);
  });

  it("mapRange: 토큰을 덮는 범위는 원문 값 전체로, 뒤쪽 범위는 평행 이동", () => {
    expect(mapRange(3, 20, r)).toEqual({ start: 3, end: 9 });
    expect(mapRange(5, 12, r)).toEqual({ start: 3, end: 9 });
    expect(mapRange(23, 25, r)).toEqual({ start: 12, end: 14 });
    expect(src.slice(12, 14)).toBe("확인");
  });

  it("여러 스팬에 걸쳐 누적된다", () => {
    const multi = mask(SLACK_MSG, { dictionary: DICT, style: "token" });
    const target = "검토합니다";
    const m = multi.masked.indexOf(target);
    const o = SLACK_MSG.indexOf(target);
    expect(m).not.toBe(o);
    expect(mapRange(m, m + target.length, multi)).toEqual({ start: o, end: o + target.length });
    const last = multi.spans[multi.spans.length - 1];
    expect(last).toBeDefined();
    if (last) {
      const rng = mapRange(last.start, last.end, multi);
      expect(SLACK_MSG.slice(rng.start, rng.end)).toBe("삼성전자");
    }
  });
});
