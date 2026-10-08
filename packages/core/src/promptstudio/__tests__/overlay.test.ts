import { describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, applyOverlayOps, mergeWorkspace, overlayIssues, resolveRepos, type WorkspaceOverlay } from "../workspace";

const ov = (o: Partial<WorkspaceOverlay>): WorkspaceOverlay => ({ version: 1, repos: [], projects: {}, conventions: [], glossary: {}, defaults: {}, ...o });
const repo = (name: string, extra: Partial<WorkspaceOverlay["repos"][number]> = {}) => ({ name, aliases: [], entry: [], verify: [], notes: [], ...extra });

describe("workspace overlay (내 작업 공간)", () => {
  it("adds onto a team repo without touching its description, and adds my own repo", () => {
    const { profile, drops } = mergeWorkspace(EXAMPLE_PROFILE, ov({
      repos: [repo("Reporter-API", { aliases: ["rapi"], verify: ["./gradlew check"] }), repo("my-tool", { what: "개인 스크립트", aliases: ["툴"] })],
      conventions: ["내 규칙"], defaults: { length: "standard" },
    }));
    expect(drops).toEqual([]);
    const r = profile!.repos.find((x) => x.name === "reporter-api")!;
    expect(r.what).toBe(EXAMPLE_PROFILE.repos[0]!.what);
    expect(r.aliases).toContain("rapi");
    expect(r.verify).toEqual(["./gradlew test", "./gradlew check"]);
    expect(profile!.repos.at(-1)).toMatchObject({ name: "my-tool", what: "개인 스크립트", aliases: ["툴"] });
    expect(profile!.conventions.at(-1)).toBe("내 규칙");
    expect(profile!.defaults).toEqual({ runtime: "claude_code", length: "standard" });
    expect(resolveRepos(profile!, { title: "[툴] 정리" }).map((m) => m.repo.name)).toEqual(["my-tool"]);
  });

  it("drops entries the team later broke: orphan add-on, name collision, alias collision (team wins)", () => {
    const team = { ...EXAMPLE_PROFILE, repos: EXAMPLE_PROFILE.repos.filter((r) => r.name !== "eximbay-partner") };
    const { profile, drops } = mergeWorkspace(team, ov({
      repos: [
        repo("eximbay-partner", { verify: ["x"] }),                     // 팀에서 지워짐 → 고아
        repo("reporter-legacy", { what: "내가 아는 다른 저장소" }),       // 팀에 같은 이름 → 통째로 버림
        repo("reporter-api", { aliases: ["legacy", "rapi"] }),          // legacy는 reporter-legacy 별칭 → 그것만 버림
      ],
    }));
    expect(drops.map((d) => d.repo)).toEqual(["eximbay-partner", "reporter-legacy", "reporter-api"]);
    expect(profile!.repos.find((r) => r.name === "reporter-legacy")!.what).toBe(team.repos[1]!.what);
    expect(profile!.repos.find((r) => r.name === "reporter-api")!.aliases).toContain("rapi");
    expect(profile!.repos.find((r) => r.name === "reporter-api")!.aliases).not.toContain("legacy");
    expect(profile!.repos.some((r) => r.name === "eximbay-partner")).toBe(false);
  });

  it("no team file: my layer alone becomes the profile; empty layer keeps null", () => {
    expect(mergeWorkspace(null, ov({})).profile).toBeNull();
    expect(mergeWorkspace(null, ov({ repos: [repo("solo", { what: "혼자 쓰는 것" })] })).profile!.repos.map((r) => r.name)).toEqual(["solo"]);
  });

  it("save-time check: what on a team add-on, missing what, alias taken, too many conventions", () => {
    const issues = overlayIssues(EXAMPLE_PROFILE, ov({
      repos: [repo("reporter-api", { what: "덮어쓰기" }), repo("new-one"), repo("other", { what: "다른 것", aliases: ["리포터"] }), repo("레거시", { what: "x" })],
      conventions: ["1", "2", "3", "4", "5", "6"],
    }));
    expect(issues["conventions"]).toMatch(/5개까지/);
    const ok = overlayIssues(EXAMPLE_PROFILE, ov({ repos: [repo("reporter-api", { what: "덮어쓰기" }), repo("new-one"), repo("other", { what: "다른 것", aliases: ["리포터"] }), repo("레거시", { what: "x" })] }));
    expect(ok["repos.0.what"]).toMatch(/팀 값/);
    expect(ok["repos.1.what"]).toMatch(/설명이 필요/);
    expect(ok["repos.2.aliases.0"]).toMatch(/reporter-api/);
    expect(ok["repos.3.name"]).toMatch(/reporter-legacy/);
    expect(overlayIssues(EXAMPLE_PROFILE, ov({ repos: [repo("reporter-api", { aliases: ["rapi"] })] }))).toEqual({});
  });

  it("'add to profile' ops land in my layer, creating an add-on for team repos", () => {
    const r = applyOverlayOps(EXAMPLE_PROFILE, ov({}), [
      { op: "add_alias", repo: "Reporter-Api", alias: "[rapi]" },
      { op: "add_verify", repo: "reporter-legacy", command: "mvn test" },
      { op: "add_alias", repo: "reporter-api", alias: "리포터" },          // 이미 있음 → 건너뜀
      { op: "add_repo", name: "new-svc", what: "새 서비스", aliases: [], verify: [] },
      { op: "add_alias", repo: "new-svc", alias: "뉴" },
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(r.changes).toHaveLength(4);
    expect(r.overlay.repos).toEqual([
      repo("reporter-api", { aliases: ["[rapi]"] }),
      repo("reporter-legacy", { verify: ["mvn test"] }),
      repo("new-svc", { what: "새 서비스", aliases: ["뉴"] }),
    ]);
    expect(overlayIssues(EXAMPLE_PROFILE, r.overlay)).toEqual({});
    const bad = applyOverlayOps(EXAMPLE_PROFILE, ov({}), [{ op: "add_alias", repo: "reporter-api", alias: "legacy" }]);
    expect(bad.ok).toBe(false);
    expect(applyOverlayOps(EXAMPLE_PROFILE, ov({}), [{ op: "add_verify", repo: "nope", command: "x" }]).ok).toBe(false);
  });
});

describe("workspace overlay — PATCH edge cases", () => {
  it("refuses what would be dropped at merge, reuses an orphan row, and says why the team file is missing", () => {
    // 팀 별칭과 같은 이름의 새 저장소 → 합칠 때 빠지므로 추가하지 않는다
    expect(applyOverlayOps(EXAMPLE_PROFILE, ov({}), [{ op: "add_repo", name: "레거시", what: "x", aliases: [], verify: [] }]).ok).toBe(false);
    // 고아 얹기 항목과 같은 이름으로 추가 → 그 행을 내 저장소로 바꾼다(중복 행 없음)
    const r = applyOverlayOps(EXAMPLE_PROFILE, ov({ repos: [repo("gone", { verify: ["make"] })] }), [{ op: "add_repo", name: "gone", what: "이제 내 저장소", aliases: [], verify: [] }]);
    if (!r.ok) throw new Error(r.message);
    expect(r.overlay.repos).toEqual([repo("gone", { what: "이제 내 저장소", verify: ["make"] })]);
    // 이름 충돌로 버려진 내 항목에 얹으려 하면 '추가'라고 답하지 않는다
    expect(applyOverlayOps(EXAMPLE_PROFILE, ov({ repos: [repo("reporter-api", { what: "다른 것" })] }), [{ op: "add_alias", repo: "reporter-api", alias: "새별칭" }]).ok).toBe(false);
    // 팀이 지워 고아가 된 항목이 있어도, 상관없는 저장소에 추가하는 것은 막지 않는다
    const withOrphan = applyOverlayOps(EXAMPLE_PROFILE, ov({ repos: [repo("gone", { verify: ["make"] })] }), [{ op: "add_verify", repo: "reporter-legacy", command: "mvn verify" }]);
    expect(withOrphan.ok).toBe(true);
    // 버려진 충돌 행에 검증 명령을 넣으려 해도 거부(별칭과 같은 규칙)
    expect(applyOverlayOps(EXAMPLE_PROFILE, ov({ repos: [repo("reporter-legacy", { what: "다른 것" })] }), [{ op: "add_verify", repo: "reporter-legacy", command: "mvn verify" }]).ok).toBe(false);
    // 팀 파일을 못 읽는 동안: 얹기 항목은 빠지되 이유가 사실대로
    expect(mergeWorkspace(null, ov({ repos: [repo("reporter-api", { aliases: ["x"] })] }), { teamUnreadable: true }).drops[0]!.reason).toMatch(/파일에 오류/);
  });
});
