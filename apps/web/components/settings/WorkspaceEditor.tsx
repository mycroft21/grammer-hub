"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Input, Popconfirm, Select, Space, Tabs, Tag, Typography } from "antd";
import { DeleteOutlined, DownloadOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { EMPTY_PROFILE, EXAMPLE_PROFILE, cleanProfileDraft, formatProfile, parseWorkspaceProfile, profileIssues, type PromptLanguage, type PromptLength, type Runtime, type WorkspaceProfile } from "@grammer-hub/core";
import { api, type WorkspaceFileDto } from "@/lib/api";
import { errMsg } from "@/components/pages/_shared";
import { LANG_LABEL, LENGTH_KO, RUNTIME_LABEL } from "@/components/studio/labels";

/**
 * 작업 공간 프로필 편집기. 파일 형식(studio.workspace.json)은 그대로 두고 입력만 폼으로 바꾼다.
 * - 폼 탭: 저장소 카드·키-값 표·목록. 검증 실패는 해당 칸 옆에 붙는다(zod 경로 → 칸).
 * - JSON 탭: 붙여넣기·고급 편집. 원문 그대로 저장한다(들여쓰기·$comment 보존).
 * - 가져오기/내보내기: 팀 프로필을 파일로 주고받는다. 테스터는 받은 파일을 가져오기만 하면 된다.
 * 저장은 두 탭 모두 서버에서 같은 검증(parseWorkspaceProfile)을 거친다.
 */

interface KV { k: string; v: string }
interface FormRepo { name: string; what: string; stack: string; aliases: string[]; verify: string[]; entryText: string; notesText: string }
interface FormModel { team: string; repos: FormRepo[]; projects: KV[]; conventions: string[]; glossary: KV[]; defaults: WorkspaceProfile["defaults"] }

const toKV = (r: Record<string, string>): KV[] => Object.entries(r).map(([k, v]) => ({ k, v }));
const fromKV = (rows: KV[]): Record<string, string> => Object.fromEntries(rows.map((r) => [r.k, r.v]));
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
function toModel(p: WorkspaceProfile): FormModel {
  return {
    team: p.team ?? "",
    repos: p.repos.map((r) => ({ name: r.name, what: r.what, stack: r.stack ?? "", aliases: r.aliases, verify: r.verify, entryText: r.entry.join("\n"), notesText: r.notes.join("\n") })),
    projects: toKV(p.projects), conventions: [...p.conventions], glossary: toKV(p.glossary), defaults: { ...p.defaults },
  };
}
function toProfile(m: FormModel): WorkspaceProfile {
  return cleanProfileDraft({
    version: 1, team: m.team,
    repos: m.repos.map((r) => ({ name: r.name, what: r.what, stack: r.stack, aliases: r.aliases, verify: r.verify, entry: lines(r.entryText), notes: lines(r.notesText) })),
    projects: fromKV(m.projects), conventions: m.conventions, glossary: fromKV(m.glossary), defaults: m.defaults,
  });
}
/** 키-값 표는 Record로 바뀌면서 중복 키가 합쳐지므로 폼 단계에서 잡는다. 빈 행(키·값 모두 빈 칸)은 저장 때 버려지니 오류가 아니다. */
function kvIssues(rows: KV[], prefix: string, out: Record<string, string>): void {
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const k = r.k.trim(), v = r.v.trim();
    if (!k && !v) return;
    if (!k) out[`${prefix}.${i}`] = "키를 적어 주세요";
    else if (!v) out[`${prefix}.${i}`] = "뜻을 적어 주세요";
    else if (seen.has(k)) out[`${prefix}.${i}`] = `키 중복: ${k}`;
    else seen.set(k, i);
  });
}
function validate(m: FormModel): Record<string, string> {
  const out = profileIssues(toProfile(m));
  kvIssues(m.projects, "projects", out); kvIssues(m.glossary, "glossary", out);
  return out;
}
const CONVENTIONS_MAX = 5;
type Defaults = WorkspaceProfile["defaults"];
/** 선택 속성에 undefined를 넣지 않고(exactOptionalPropertyTypes) 키를 빼는 방식으로 지운다. */
function setDefault<K extends keyof Defaults>(d: Defaults, key: K, v: Defaults[K] | undefined): Defaults {
  const { [key]: _drop, ...rest } = d;
  return v ? { ...rest, [key]: v } : rest;
}

export function WorkspaceEditor({ file, onSaved }: { file: WorkspaceFileDto | null; onSaved: (f: WorkspaceFileDto) => void }) {
  const { message } = App.useApp();
  const [tab, setTab] = useState<"form" | "json">("form");
  const [model, setModel] = useState<FormModel>(() => toModel(EMPTY_PROFILE));
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // 파일이 새로 읽히면(첫 로드·저장 후·다시 읽기) 폼과 JSON을 파일 기준으로 되돌린다. 파일에 오류가 있으면 폼을 만들 수 없으니 JSON 탭에서 고치게 한다.
  const loadFrom = (f: WorkspaceFileDto | null) => {
    if (!f) return;
    setText(f.text || "");
    if (f.profile) { setModel(toModel(f.profile)); setTab("form"); }
    else if (f.exists) { setTab("json"); }
    else { setModel(toModel(EMPTY_PROFILE)); setTab("form"); }
    setIssues({}); setErr(null); setDirty(false);
  };
  useEffect(() => { loadFrom(file); }, [file]);  // eslint-disable-line react-hooks/exhaustive-deps

  const update = (fn: (m: FormModel) => FormModel) => { setModel((m) => fn(m)); setDirty(true); };
  const updateRepo = (i: number, patch: Partial<FormRepo>) => update((m) => ({ ...m, repos: m.repos.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const setKV = (key: "projects" | "glossary", i: number, patch: Partial<KV>) => update((m) => ({ ...m, [key]: m[key].map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  /** 탭을 오갈 때 한쪽을 다른 쪽으로 변환한다. JSON → 폼은 파싱이 되어야 넘어간다. */
  const switchTab = (next: string) => {
    if (next === tab) return;
    if (next === "json") { setText(formatProfile(toProfile(model))); setTab("json"); return; }
    const r = parseWorkspaceProfile(text);
    if (!r.ok) { setErr(`JSON 탭 내용에 오류가 있어 폼으로 옮길 수 없습니다: ${r.message}`); return; }
    setModel(toModel(r.profile)); setErr(null); setIssues({}); setTab("form");
  };

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      if (tab === "form") {
        const found = validate(model);
        setIssues(found);
        if (Object.keys(found).length) { setErr(`${Object.keys(found).length}개 칸을 확인해 주세요(빨간 안내가 붙은 칸).`); return; }
        const r = await api.settings.saveWorkspaceProfile(toProfile(model));
        onSaved(r); message.success(`프로필을 저장했습니다 · 저장소 ${r.repos}개`);
      } else {
        const r = await api.settings.saveWorkspace(text);
        onSaved(r); message.success(`프로필을 저장했습니다 · 저장소 ${r.repos}개`);
      }
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  };

  const exportFile = () => {
    let body: string;
    if (tab === "json") body = text;
    else body = formatProfile(toProfile(model));
    const url = URL.createObjectURL(new Blob([body], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "studio.workspace.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    let raw = "";
    try { raw = await f.text(); } catch (e) { setErr(`파일을 읽지 못했습니다: ${errMsg(e)}`); return; }
    const r = parseWorkspaceProfile(raw);
    if (!r.ok) { setErr(`가져온 파일에 오류가 있습니다: ${r.message}`); return; }
    setModel(toModel(r.profile)); setText(raw); setIssues({}); setErr(null); setDirty(true); setTab("form");
    message.info(`${f.name}을(를) 불러왔습니다 · 저장소 ${r.profile.repos.length}개 — 확인한 뒤 "검증 후 저장"을 누르세요.`);
  };
  const loadExample = () => { setModel(toModel(EXAMPLE_PROFILE)); setText(formatProfile(EXAMPLE_PROFILE)); setIssues({}); setErr(null); setDirty(true); };

  const small = { fontSize: 12 } as const;
  const fieldErr = (k: string) => (issues[k] ? <Typography.Text type="danger" style={small} className="mt-0.5 block" data-testid="ws-field-error">{issues[k]}</Typography.Text> : null);
  const status = !file ? "" : file.exists ? (file.summary ? `저장소 ${file.summary.repos}개` : "오류") : "없음";
  const conventionsOver = model.conventions.filter((c) => c.trim()).length > CONVENTIONS_MAX;

  const form = (
    <div className="flex flex-col gap-4" data-testid="workspace-form">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-1">
          <Typography.Text strong style={{ fontSize: 13 }}>팀 이름</Typography.Text>
          <Input className="mt-1" value={model.team} placeholder="결제 플랫폼 개발팀" onChange={(e) => update((m) => ({ ...m, team: e.target.value }))} allowClear data-testid="ws-team" />
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>기본 실행 환경</Typography.Text>
          <Select className="mt-1 w-full" allowClear placeholder="분류별 기본값" value={model.defaults.runtime} onChange={(v: Runtime | undefined) => update((m) => ({ ...m, defaults: setDefault(m.defaults, "runtime", v) }))}
            options={(Object.keys(RUNTIME_LABEL) as Runtime[]).map((k) => ({ value: k, label: RUNTIME_LABEL[k] }))} />
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>기본 분량</Typography.Text>
          <Select className="mt-1 w-full" allowClear placeholder="분류별 기본값" value={model.defaults.length} onChange={(v: PromptLength | undefined) => update((m) => ({ ...m, defaults: setDefault(m.defaults, "length", v) }))}
            options={(Object.keys(LENGTH_KO) as PromptLength[]).map((k) => ({ value: k, label: LENGTH_KO[k] }))} />
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>기본 프롬프트 언어</Typography.Text>
          <Select className="mt-1 w-full" allowClear placeholder="한국어" value={model.defaults.promptLanguage} onChange={(v: PromptLanguage | undefined) => update((m) => ({ ...m, defaults: setDefault(m.defaults, "promptLanguage", v) }))}
            options={(Object.keys(LANG_LABEL) as PromptLanguage[]).map((k) => ({ value: k, label: LANG_LABEL[k] }))} />
        </div>
      </div>
      <Typography.Text type="secondary" style={small}>기본값은 개발 목적의 티켓·목표에서 검토 화면의 초기값이 됩니다. 비우면 분류별 기본값을 씁니다.</Typography.Text>

      <div>
        <div className="flex items-center justify-between">
          <Typography.Text strong style={{ fontSize: 13 }}>저장소 <Typography.Text type="secondary" style={small}>{model.repos.length}개 · 별칭은 티켓 제목·라벨에서 저장소를 찾는 열쇠</Typography.Text></Typography.Text>
          <Button size="small" icon={<PlusOutlined />} data-testid="ws-repo-add" onClick={() => update((m) => ({ ...m, repos: [...m.repos, { name: "", what: "", stack: "", aliases: [], verify: [], entryText: "", notesText: "" }] }))}>저장소 추가</Button>
        </div>
        <div className="mt-2 flex flex-col gap-3">
          {model.repos.length === 0 && <Typography.Text type="secondary" style={small}>아직 없습니다. "저장소 추가"를 누르거나 "예시 불러오기"로 형태를 보세요. 티켓 검토 화면에서 저장소를 고르면 여기에 자동으로 쌓이기도 합니다.</Typography.Text>}
          {model.repos.map((r, i) => (
            <div key={i} className="rounded-lg border p-3" style={{ borderColor: "var(--ant-color-border-secondary)" }} data-testid={`ws-repo-${i}`}>
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <Typography.Text type="secondary" style={small}>이름 *</Typography.Text>
                  <Input className="mt-1" status={issues[`repos.${i}.name`] ? "error" : ""} value={r.name} placeholder="reporter-api" onChange={(e) => updateRepo(i, { name: e.target.value })} data-testid={`ws-repo-name-${i}`} />
                  {fieldErr(`repos.${i}.name`)}
                </div>
                <div className="md:col-span-6">
                  <Typography.Text type="secondary" style={small}>무슨 시스템인지 한 줄 *</Typography.Text>
                  <Input className="mt-1" status={issues[`repos.${i}.what`] ? "error" : ""} value={r.what} placeholder="가맹점 어드민 백엔드 API. 정산·카드사 상태 로직" onChange={(e) => updateRepo(i, { what: e.target.value })} data-testid={`ws-repo-what-${i}`} />
                  {fieldErr(`repos.${i}.what`)}
                </div>
                <div className="md:col-span-3">
                  <Typography.Text type="secondary" style={small}>스택</Typography.Text>
                  <Input className="mt-1" value={r.stack} placeholder="Java 17 / Spring Boot" onChange={(e) => updateRepo(i, { stack: e.target.value })} />
                </div>
                <div className="md:col-span-6">
                  <Typography.Text type="secondary" style={small}>별칭 — 티켓에서 이 저장소를 가리키는 말 (입력 후 Enter)</Typography.Text>
                  <Select className="mt-1 w-full" mode="tags" value={r.aliases} placeholder="[partner], 파트너, partner" tokenSeparators={[","]} open={false} suffixIcon={null} onChange={(v) => updateRepo(i, { aliases: v as string[] })} data-testid={`ws-repo-aliases-${i}`} />
                </div>
                <div className="md:col-span-6">
                  <Typography.Text type="secondary" style={small}>검증 명령 (입력 후 Enter)</Typography.Text>
                  <Select className="mt-1 w-full" mode="tags" value={r.verify} placeholder="./gradlew test" tokenSeparators={[","]} open={false} suffixIcon={null} onChange={(v) => updateRepo(i, { verify: v as string[] })} data-testid={`ws-repo-verify-${i}`} />
                </div>
                <div className="md:col-span-6">
                  <Typography.Text type="secondary" style={small}>어디부터 보면 되는지 (한 줄에 하나)</Typography.Text>
                  <Input.TextArea className="mt-1" autoSize={{ minRows: 1, maxRows: 4 }} value={r.entryText} placeholder="어드민 화면 *.do → 같은 이름의 *Controller → *CommandService" onChange={(e) => updateRepo(i, { entryText: e.target.value })} />
                </div>
                <div className="md:col-span-6">
                  <Typography.Text type="secondary" style={small}>주의 (한 줄에 하나)</Typography.Text>
                  <Input.TextArea className="mt-1" autoSize={{ minRows: 1, maxRows: 4 }} value={r.notesText} placeholder="신규 비즈니스 로직을 넣지 않는다" onChange={(e) => updateRepo(i, { notesText: e.target.value })} />
                </div>
              </div>
              <div className="mt-2 text-right">
                <Popconfirm title={`${r.name || "이 저장소"}를 목록에서 뺄까요?`} okText="빼기" cancelText="취소" onConfirm={() => update((m) => ({ ...m, repos: m.repos.filter((_, j) => j !== i) }))}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}>빼기</Button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KVTable title="Jira 프로젝트 키의 뜻" hint="분류 힌트. 키 = 이슈 키 앞부분(EP-1174의 EP)" keyPh="EP" valPh="결제 플랫폼 개발 요청" rows={model.projects} prefix="projects" issues={issues}
          onChange={(i, p) => setKV("projects", i, p)} onAdd={() => update((m) => ({ ...m, projects: [...m.projects, { k: "", v: "" }] }))} onRemove={(i) => update((m) => ({ ...m, projects: m.projects.filter((_, j) => j !== i) }))} />
        <KVTable title="용어집" hint="텍스트에 나오는 용어만 프롬프트에 들어갑니다" keyPh="서브몰" valPh="가맹점 아래의 하위 상점 단위" rows={model.glossary} prefix="glossary" issues={issues}
          onChange={(i, p) => setKV("glossary", i, p)} onAdd={() => update((m) => ({ ...m, glossary: [...m.glossary, { k: "", v: "" }] }))} onRemove={(i) => update((m) => ({ ...m, glossary: m.glossary.filter((_, j) => j !== i) }))} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Typography.Text strong style={{ fontSize: 13 }}>팀 규칙 <Tag color={conventionsOver ? "warning" : "default"} style={{ fontSize: 11, marginLeft: 6 }} data-testid="ws-conventions-count">{model.conventions.filter((c) => c.trim()).length}/{CONVENTIONS_MAX} 권장</Tag></Typography.Text>
          <Button size="small" icon={<PlusOutlined />} data-testid="ws-convention-add" onClick={() => update((m) => ({ ...m, conventions: [...m.conventions, ""] }))}>규칙 추가</Button>
        </div>
        <Typography.Text type="secondary" style={small} className="block">모든 개발 프롬프트의 규칙 후보. 모델이 이 목표에 걸리는 것만 고릅니다. 길면 아무것도 지켜지지 않으니 {CONVENTIONS_MAX}개 이하로.</Typography.Text>
        <div className="mt-2 flex flex-col gap-2">
          {model.conventions.map((c, i) => (
            <Space.Compact key={i} className="w-full">
              <Input value={c} placeholder="티켓 범위 밖 리팩터링은 제안만 하고 코드로 쓰지 않는다" onChange={(e) => update((m) => ({ ...m, conventions: m.conventions.map((x, j) => (j === i ? e.target.value : x)) }))} data-testid={`ws-convention-${i}`} />
              <Button icon={<DeleteOutlined />} onClick={() => update((m) => ({ ...m, conventions: m.conventions.filter((_, j) => j !== i) }))} aria-label="규칙 빼기" />
            </Space.Compact>
          ))}
        </div>
      </div>
    </div>
  );

  const jsonTab = (
    <div>
      <Input.TextArea data-testid="workspace-editor" value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }} autoSize={{ minRows: 12, maxRows: 34 }} spellCheck={false}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 }} placeholder='{ "version": 1, "repos": [ … ] }' />
      <Typography.Text type="secondary" style={small} className="mt-1 block">붙여넣기·고급 편집용. 필드 설명은 docs/05 §A-3″. 저장하면 이 원문이 그대로 파일에 쓰입니다.</Typography.Text>
    </div>
  );

  return (
    <Card size="small" title="작업 공간 프로필" data-testid="workspace-card"
      extra={<Typography.Text type="secondary" style={small}>{file?.path ?? "studio.workspace.json"} · {status}{dirty ? " · 저장 안 됨" : ""}</Typography.Text>}>
      <Typography.Paragraph type="secondary" style={{ ...small, marginBottom: 8 }}>
        팀의 저장소(이름·별칭·검증 명령·주의), Jira 프로젝트 뜻, 팀 규칙, 용어를 적어 두면 티켓마다 "어느 저장소?"를 묻지 않고 프롬프트에 검증 명령·규칙이 들어갑니다.
        팀에서 만든 프로필 파일을 받았다면 <b>가져오기</b>로 불러온 뒤 저장하면 끝입니다.
      </Typography.Paragraph>
      {file?.error && <Alert type="error" showIcon message={`현재 파일 오류: ${file.error} — JSON 탭에서 고치거나 예시를 불러와 다시 저장하세요.`} className="mb-2" />}
      {err && <Alert type="error" showIcon message={err} className="mb-2" data-testid="workspace-error" closable onClose={() => setErr(null)} />}
      <Tabs size="small" activeKey={tab} onChange={switchTab} items={[
        { key: "form", label: "폼", children: form, disabled: Boolean(file?.exists && !file.profile && !dirty) },
        { key: "json", label: "JSON", children: jsonTab },
      ]} />
      <Space wrap className="mt-2">
        <Button data-testid="workspace-save" type="primary" loading={saving} onClick={() => void save()}>검증 후 저장</Button>
        <Button icon={<UploadOutlined />} onClick={() => fileInput.current?.click()}>가져오기</Button>
        <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: "none" }} data-testid="workspace-import" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button icon={<DownloadOutlined />} data-testid="workspace-export" onClick={exportFile}>내보내기</Button>
        <Button onClick={loadExample}>예시 불러오기</Button>
        {file?.exists && <Button type="text" disabled={!dirty} onClick={() => loadFrom(file)}>파일 내용으로 되돌리기</Button>}
      </Space>
    </Card>
  );
}

function KVTable({ title, hint, keyPh, valPh, rows, prefix, issues, onChange, onAdd, onRemove }: {
  title: string; hint: string; keyPh: string; valPh: string; rows: KV[]; prefix: string; issues: Record<string, string>;
  onChange: (i: number, patch: Partial<KV>) => void; onAdd: () => void; onRemove: (i: number) => void;
}) {
  const small = { fontSize: 12 } as const;
  return (
    <div data-testid={`ws-${prefix}`}>
      <div className="flex items-center justify-between">
        <Typography.Text strong style={{ fontSize: 13 }}>{title} <Typography.Text type="secondary" style={small}>{rows.length}개</Typography.Text></Typography.Text>
        <Button size="small" icon={<PlusOutlined />} onClick={onAdd} data-testid={`ws-${prefix}-add`}>추가</Button>
      </div>
      <Typography.Text type="secondary" style={small} className="block">{hint}</Typography.Text>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i}>
            <Space.Compact className="w-full">
              <Input style={{ width: "34%" }} status={issues[`${prefix}.${i}`] ? "error" : ""} value={r.k} placeholder={keyPh} onChange={(e) => onChange(i, { k: e.target.value })} />
              <Input status={issues[`${prefix}.${i}`] ? "error" : ""} value={r.v} placeholder={valPh} onChange={(e) => onChange(i, { v: e.target.value })} />
              <Button icon={<DeleteOutlined />} onClick={() => onRemove(i)} aria-label="행 빼기" />
            </Space.Compact>
            {issues[`${prefix}.${i}`] && <Typography.Text type="danger" style={small} className="mt-0.5 block" data-testid="ws-field-error">{issues[`${prefix}.${i}`]}</Typography.Text>}
          </div>
        ))}
      </div>
    </div>
  );
}
