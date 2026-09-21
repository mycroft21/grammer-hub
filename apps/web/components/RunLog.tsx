"use client";
import { useState } from "react";
import { Button, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";

/** 진행 로그. 기본 접힘, 실행 중엔 자동으로 펼쳐 마지막 몇 줄을 보여준다. */
export function RunLog({ entries, running, compact }: { entries: { t: number; msg: string }[]; running?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null);
  if (entries.length === 0) return null;
  const isOpen = open ?? Boolean(running);
  const shown = isOpen ? entries : entries.slice(-1);
  return (
    <div data-testid="run-log" className={compact ? "" : "px-3 pb-1.5"}>
      <Button type="text" size="small" className="!px-1 !text-[12px]" onClick={() => setOpen(!isOpen)} icon={isOpen ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}>
        로그 {entries.length}
      </Button>
      <ul className="m-0 mt-0.5 max-h-40 list-none overflow-y-auto p-0" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, lineHeight: 1.6 }}>
        {shown.map((e, i) => (
          <li key={`${e.t}-${i}`} className="flex gap-2">
            <Typography.Text type="secondary" style={{ fontSize: 11.5, minWidth: 52, textAlign: "right" }}>+{(e.t / 1000).toFixed(1)}s</Typography.Text>
            <span className="min-w-0 truncate" title={e.msg}>{e.msg}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
