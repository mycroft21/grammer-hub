import { z } from "zod";

const UNSUPPORTED_KEYS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "format", "$schema",
]);

/**
 * Claude 구조화 출력(`output_config.format`)용 JSON Schema.
 * API가 지원하지 않는 값 제약을 제거하고 모든 object에 additionalProperties:false를 보장한다.
 * SDK의 zodOutputFormat은 zod 4 정수의 safe-integer 범위를 그대로 내보내므로 이 헬퍼를 대신 쓴다.
 */
export function toOutputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  return strip(raw) as Record<string, unknown>;
}

/** 값이 "이름 → 스키마" 맵인 키워드. 여기 안의 키는 속성 이름이라 제거 대상이 아니다(예: 속성 이름이 `format`인 경우). */
const NAME_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED_KEYS.has(k)) continue;
      if (NAME_MAPS.has(k) && v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([name, sub]) => [name, strip(sub)]));
        continue;
      }
      out[k] = strip(v);
    }
    if (out["type"] === "object" && out["properties"] && out["additionalProperties"] === undefined) {
      out["additionalProperties"] = false;
    }
    return out;
  }
  return node;
}
