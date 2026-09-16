import type { Category } from "../schema/correction";
import type { z } from "zod";
import type { Honorific } from "../schema/profile";

export interface CategoryDef { name: Category; title: string; desc: string; examples: [string, string][] }

/** 카테고리 정의 + 예시 2개. 고정 시스템 블록에 들어가므로 수정 시 PROMPT_VERSION을 올린다. */
export const CATEGORY_DEFS: ReadonlyArray<CategoryDef> = [
  { name: "SPACING", title: "띄어쓰기", desc: "의존명사·보조용언·조사·단위 등 한글 맞춤법 띄어쓰기 규정 위반.",
    examples: [["할수있다", "할 수 있다"], ["확인부탁드립니다", "확인 부탁드립니다"]] },
  { name: "SPELLING", title: "철자·표기", desc: "오탈자, 어미·어간 표기 오류, 외래어 표기법 위반.",
    examples: [["보내드릴께요", "보내드릴게요"], ["컨텐츠", "콘텐츠"]] },
  { name: "GRAMMAR", title: "문법", desc: "조사 오용, 주술 호응, 시제·피동 오류, 문장 성분 누락.",
    examples: [["자료을 첨부합니다", "자료를 첨부합니다"], ["회의가 진행하겠습니다", "회의를 진행하겠습니다"]] },
  { name: "PUNCTUATION", title: "문장부호", desc: "쉼표·마침표·물음표 누락이나 오용, 괄호·따옴표 짝 불일치.",
    examples: [["팀장님 어제 말씀하신", "팀장님, 어제 말씀하신"], ["가능할까요.", "가능할까요?"]] },
  { name: "HONORIFIC", title: "높임", desc: "높임 단계 혼용, 사물 존대, 이중 존대, 압존법 오적용(직장에서는 압존법을 적용하지 않음).",
    examples: [["커피 나오셨습니다", "커피 나왔습니다"], ["말씀이 계시겠습니다", "말씀하시겠습니다"]] },
  { name: "REGISTER", title: "문체·격식", desc: "문어·구어 혼용, 개조식·서술식 혼용, 채널에 맞지 않는 이모티콘·줄임말·비속어.",
    examples: [["근데 이건 좀 애매함", "다만 이 부분은 판단이 필요합니다"], ["ㅎㅎ 확인했습니다", "확인했습니다"]] },
  { name: "WORD_CHOICE", title: "어휘", desc: "부적절하거나 모호한 단어, 불필요한 외래어·한자어, 중복 표현.",
    examples: [["이슈를 resolve 했습니다", "이슈를 해결했습니다"], ["다시 재확인", "재확인"]] },
  { name: "CLARITY", title: "명확성", desc: "주체·시점·대상이 불분명한 문장, 중의적 표현, 지시어 남용.",
    examples: [["보내드릴게요", "오늘 오후 3시까지 보내드릴게요"], ["그거 처리했습니다", "정산 오류 건은 처리했습니다"]] },
  { name: "CONCISENESS", title: "간결성", desc: "군말, 겹말, 불필요한 서술, 장황한 완곡 표현.",
    examples: [["확인 부탁드리겠습니다", "확인 부탁드립니다"], ["~하는 것에 대해서는", "~는"]] },
  { name: "TONE", title: "어조", desc: "프로필의 톤(중립·정중·단호·친근·완곡)과 어긋나는 표현, 수신자에게 공격적·수동적으로 읽힐 표현.",
    examples: [["왜 아직 안 됐나요?", "진행 상황을 공유해 주실 수 있을까요?"], ["일단 해보겠습니다", "확인 후 오늘 중 회신드리겠습니다"]] },
];

export const HONORIFIC_DEFS: Record<z.infer<typeof Honorific>, { title: string; desc: string; example: string }> = {
  hasipsio: { title: "하십시오체", desc: "-습니다/-ㅂ니다, -십니까 종결. 상급자 공식 보고, 고객, 공지.", example: "검토 후 회신드리겠습니다." },
  haeyo: { title: "해요체", desc: "-요 종결. 동료·상급자와의 메신저, 가벼운 이메일.", example: "검토하고 회신드릴게요." },
  hae: { title: "해체", desc: "반말 종결. 친밀한 동료 간 메신저에서만.", example: "검토하고 알려줄게." },
  gaejo: { title: "개조식", desc: "명사형 종결(-함/-임/-음/-됨), 문장부호 최소, 번호·불릿 구조. 보고서·회의록.", example: "검토 후 회신 예정" },
};
