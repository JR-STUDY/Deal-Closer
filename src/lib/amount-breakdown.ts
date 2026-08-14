/**
 * 금액 내역 표기 — 확정 문서 **본문의 요약 행을 그대로 비춰 준다** (4차 피드백 W-C 1).
 *
 * ## 왜 부가세를 우리가 계산하지 않는가
 *
 * `Document.amount` 는 본문 품목표의 **마지막 요약 행 값**이다
 * (`itemTableGrandTotal` — 요약 행이 없으면 품목 소계). 즉 그 숫자의 정체가 **문서마다 다르다**.
 *  - 요약 행 없음 → 품목 소계 = 부가세 별도
 *  - `부가세 포함 합계` 프리셋 → 마지막 행이 `subtotal * 1.1` 이라 **이미 부가세가 들어 있다**
 *  - 사용자가 손으로 만든 요약 행 → 마지막 행이 무엇이냐에 달렸다 (수식이 자유롭다)
 *
 * 그래서 10% 를 우리가 곱하면 안 된다 — 이미 포함된 문서에 또 붙이면 121% 가 된다.
 * 라벨을 보고 "이건 부가세 포함이다" 라고 **분류하려 들지도 않는다**. 수식이 임의라 분류는
 * 언제든 틀린다. 이 모듈이 하는 일은 **문서가 적은 라벨과, 그 라벨의 수식을 평가한 값을
 * 그대로 옮기는 것**뿐이다. 값 평가는 `evalSummaryRows()` 를 재사용한다 (수식 평가기가
 * 두 벌이 되면 화면 숫자와 PDF 숫자가 갈라진다).
 *
 * ## 마지막 요약 행을 왜 빼는가
 *
 * 마지막 행 값 = `Document.amount` = 화면에 이미 큰 글씨로 떠 있는 예상 금액이다. 같은 숫자를
 * 바로 아래 한 번 더 적으면 읽는 사람이 "다른 금액인가" 하고 멈춘다. 다만 그 행의 **라벨**
 * (`합계 (VAT 포함)`)은 위 숫자가 무엇인지 알려 주는 유일한 단서라 `totalLabel` 로 살려
 * 금액 옆에 붙인다 — 값은 빼고 이름만 남긴다.
 *
 * ## 설명할 수 없으면 아무 말도 하지 않는다 (`unknown`)
 *
 * 본문이 깨져 파싱되지 않거나, 품목표가 없거나 둘 이상이거나, 본문에서 다시 계산한 총계가
 * 넘겨받은 `amount` 와 다르면 `unknown` 을 돌려주고 **화면은 아무 내역도 그리지 않는다**.
 * 이때 `부가세 별도` 로 떨어지면 안 된다 — 그것도 "부가세가 안 들어 있다" 는 하나의 주장이고,
 * 본문을 읽지 못한 상태에서는 근거가 없다. 금액에 관해 틀린 말을 하는 것이 아무 말도 하지
 * 않는 것보다 나쁘다.
 */

import {
  evalSummaryRows,
  itemTableGrandTotal,
  parseContentJson,
  type BlockPropsMap,
} from "@/lib/editor-schema";

/**
 * 내역 한 줄 — 라벨은 **문서가 적은 그대로**이고 값은 수식을 평가한 결과다.
 *
 * `id` 는 요약 행이 본문에서 갖고 있던 식별자를 그대로 옮긴 것이다. 라벨이 같은 행이 둘 이상
 * 있을 수 있고(빈 라벨이면 전부 같다) 문서를 고치면 순서도 바뀌므로, 화면 `key` 를 배열
 * 인덱스로 잡으면 값이 엉뚱한 줄에 붙는다.
 */
export type AmountBreakdownLine = { id: string; label: string; value: number };

/**
 * 한 줄에 늘어놓을 내역의 최대 개수.
 *
 * 프리셋(공급가액·부가세·합계)은 마지막 행을 빼면 2줄이라 넉넉히 들어간다. 할인·조정 행을
 * 더 쓰는 문서를 감안해 4줄까지 펼치고, 그보다 많으면 `외 N건` 으로 접어 툴팁에 담는다 —
 * 여기서 알고 싶은 것은 "부가세가 들어 있나" 이지 문서 전체의 계산서가 아니다.
 */
export const AMOUNT_BREAKDOWN_VISIBLE_MAX = 4;

export type AmountBreakdown =
  /** 요약 행이 있다 — 마지막 행은 `totalLabel` 로만 남기고 나머지를 나열한다 */
  | {
      kind: "rows";
      /** 마지막 요약 행의 라벨 (= 예상 금액이 무엇인지). 문서가 비워 뒀으면 빈 문자열 */
      totalLabel: string;
      lines: AmountBreakdownLine[];
      /** 표시 한도를 넘어 접은 줄 (툴팁에 담는다) */
      hidden: AmountBreakdownLine[];
    }
  /** 요약 행이 하나도 없다 — 금액이 품목 소계(수량×단가 합)이므로 부가세가 들어갈 자리가 없다 */
  | { kind: "subtotal" }
  /** 본문에서 금액의 근거를 확인할 수 없다 — 화면에 아무 내역도 적지 않는다 */
  | { kind: "unknown" };

const UNKNOWN: AmountBreakdown = { kind: "unknown" };

/**
 * 문서 본문(contentJson)에서 `amount` 를 설명하는 내역을 뽑는다.
 *
 * `amount` 를 함께 받는 이유는 **설명하려는 숫자가 실제로 그 숫자인지 확인**하기 위해서다.
 * `Document.amount` 는 저장 시점에 굳은 컬럼이라 본문이 나중에 달라졌을 수 있다. 본문에서
 * 다시 계산한 총계가 다르면 그 내역은 화면의 금액을 설명하지 못하므로 `unknown` 으로 뺀다.
 */
export function amountBreakdown(
  contentJson: string | null | undefined,
  amount: number,
): AmountBreakdown {
  const doc = parseContentJson(contentJson);
  if (!doc) return UNKNOWN;

  const tables = doc.blocks.filter((block) => block.type === "itemTable");
  /*
   * 품목표가 없으면 금액의 출처가 본문에 없다. 둘 이상이면 `amount` 가 표들의 **합계**라
   * 어느 한 표의 요약 행도 그 숫자를 설명하지 못한다 — 여러 표의 행을 라벨로 합치는 것은
   * 우리가 계산에 손대는 일이라 하지 않는다.
   */
  if (tables.length !== 1) return UNKNOWN;

  const props = tables[0].props as BlockPropsMap["itemTable"];
  if (itemTableGrandTotal(props) !== amount) return UNKNOWN;

  const evaluated = evalSummaryRows(props);
  if (evaluated.length === 0) return { kind: "subtotal" };

  const last = evaluated[evaluated.length - 1];
  const rest = evaluated
    .slice(0, -1)
    .map(({ row, value }) => ({ id: row.id, label: row.label, value }));

  return {
    kind: "rows",
    totalLabel: last.row.label,
    lines: rest.slice(0, AMOUNT_BREAKDOWN_VISIBLE_MAX),
    hidden: rest.slice(AMOUNT_BREAKDOWN_VISIBLE_MAX),
  };
}
