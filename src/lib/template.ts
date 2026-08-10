/**
 * 표준 양식(Template) 공용 조회 형태와 DTO (PRD 4.2.1).
 * 원본 바이트(sourceData)는 응답에 절대 포함하지 않는다 — 크기가 크고 화면에서 쓰지 않는다.
 */

/** Prisma select — 목록·상세 공용 */
export const TEMPLATE_SELECT = {
  id: true,
  name: true,
  type: true,
  scope: true,
  description: true,
  contentJson: true,
  prompt: true,
  sourceFileName: true,
  sourceMimeType: true,
  sourceSize: true,
  forkedFromId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
  variables: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      key: true,
      label: true,
      sample: true,
      required: true,
      sortOrder: true,
    },
  },
  _count: { select: { documents: true } },
} as const;

/** 양식 선택 UI 에 넘기는 최소 DTO (클라이언트 컴포넌트 전달용 — 직렬화 가능한 값만) */
export type TemplateOption = {
  id: string;
  name: string;
  type: string;
  scope: string;
  variables: { key: string; label: string; sample: string | null; required: boolean }[];
};
