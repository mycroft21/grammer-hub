import { z } from "zod";
import { Audience, Channel, Lang } from "./profile";
import { Category } from "./correction";

/** 스타일 규칙의 적용 범위. 비어 있으면 전역. */
export const RuleScope = z.object({
  channel: Channel.optional(),
  audience: Audience.optional(),
  lang: Lang.optional(),
  category: Category.optional(),
});
export type RuleScope = z.infer<typeof RuleScope>;

export const RuleStatus = z.enum(["active", "pinned", "demoted"]);

/** 사용자가 읽고 고칠 수 있는 자연어 스타일 규칙. */
export const StyleRule = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  text: z.string().min(1).max(300),
  scope: RuleScope.default({}),
  alpha: z.number().default(1),
  beta: z.number().default(1),
  confidence: z.number().min(0).max(1).default(0.5),
  status: RuleStatus.default("active"),
  createdBy: z.enum(["user", "distill"]).default("user"),
});
export type StyleRule = z.infer<typeof StyleRule>;

export const DictionaryEntry = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  term: z.string().min(1).max(80),
  note: z.string().max(200).optional(),
  mask: z.boolean().default(false),
});
export type DictionaryEntry = z.infer<typeof DictionaryEntry>;
