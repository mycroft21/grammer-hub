"use client";
import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Empty, Form, Input, Popconfirm, Switch, Table, Tag, Typography, type TableProps } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { DictionaryEntry } from "@grammer-hub/core";
import { api } from "@/lib/api";
import { PageHeader, errMsg } from "./_shared";

interface AddValues { term: string; note?: string; mask?: boolean }

export function DictionaryPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<AddValues>();
  const [list, setList] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try { setList(await api.dictionary.list()); } catch (e) { message.error(`사전을 불러오지 못했습니다: ${errMsg(e)}`); } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { void reload(); }, [reload]);

  const add = async (v: AddValues) => {
    const term = v.term.trim();
    const note = v.note?.trim();
    if (!term) return;
    setAdding(true);
    try {
      await api.dictionary.create({ term, mask: !!v.mask, ...(note ? { note } : {}) });
      form.resetFields();
      message.success(`'${term}'을(를) 추가했습니다.`);
      await reload();
    } catch (e) { message.error(`추가에 실패했습니다: ${errMsg(e)}`); } finally { setAdding(false); }
  };
  const remove = async (e: DictionaryEntry) => {
    try { await api.dictionary.remove(e.id); message.success(`'${e.term}'을(를) 삭제했습니다.`); await reload(); }
    catch (err) { message.error(`삭제에 실패했습니다: ${errMsg(err)}`); }
  };

  const columns: TableProps<DictionaryEntry>["columns"] = [
    { title: "용어", dataIndex: "term", key: "term", width: 200, render: (t: string) => <Typography.Text strong>{t}</Typography.Text> },
    { title: "메모", dataIndex: "note", key: "note", render: (n?: string) => n ? n : <Typography.Text type="secondary">-</Typography.Text> },
    { title: "마스킹", dataIndex: "mask", key: "mask", width: 110, render: (m: boolean) => m ? <Tag variant="filled">외부 전송 시 마스킹</Tag> : <Typography.Text type="secondary">-</Typography.Text> },
    {
      title: "", key: "actions", width: 72, align: "right",
      render: (_, e) => (
        <Popconfirm title="용어를 삭제할까요?" okText="삭제" cancelText="취소" okButtonProps={{ danger: true }} onConfirm={() => void remove(e)}>
          <Button type="text" size="small" danger>삭제</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="사전" description="고유명사·사내 용어·제품명을 등록하면 오탈자로 잡히지 않습니다. 마스킹을 켜면 클라우드 모델에 보내기 전에 가립니다." />
      <div className="flex flex-col gap-4">
        <Card size="small">
          <Form<AddValues> form={form} layout="inline" onFinish={(v) => void add(v)} initialValues={{ mask: false }} className="gap-y-2">
            <Form.Item name="term" rules={[{ required: true, whitespace: true, message: "용어를 입력하세요." }, { max: 80, message: "80자 이내" }]} style={{ flex: "1 1 180px" }}>
              <Input placeholder="용어 (예: 엑심베이, PG사명)" allowClear />
            </Form.Item>
            <Form.Item name="note" rules={[{ max: 200, message: "200자 이내" }]} style={{ flex: "2 1 220px" }}>
              <Input placeholder="메모 (선택)" allowClear />
            </Form.Item>
            <Form.Item name="mask" label="외부 전송 시 마스킹" valuePropName="checked" style={{ marginInlineEnd: 8 }}>
              <Switch size="small" />
            </Form.Item>
            <Form.Item style={{ marginInlineEnd: 0 }}>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={adding}>추가</Button>
            </Form.Item>
          </Form>
        </Card>
        <Table<DictionaryEntry> size="small" rowKey="id" columns={columns} dataSource={list} loading={loading} pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary">등록된 용어가 없습니다. 자주 쓰는 고유명사나 사내 약어를 넣어 두면 교정에서 그대로 보존됩니다.</Typography.Text>} /> }} />
      </div>
    </div>
  );
}
