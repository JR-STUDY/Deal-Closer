"use client";

import type {
  Block,
  BlockType,
  EditorDoc,
  AnyBlockProps,
} from "@/lib/editor-schema";

// 사용자 지정 블록/문서 템플릿을 브라우저 localStorage 에 저장한다 (#3, 스키마 변경 없음).
const CUSTOM_BLOCKS_KEY = "rainmaker:editor:customBlocks";
const TEMPLATES_KEY = "rainmaker:editor:templates";
const BASE_DEFAULTS_KEY = "rainmaker:editor:baseDefaults";

/** 팔레트에 추가되는 사용자 지정 블록 (위치·id 제외한 블록 스냅샷) */
export type CustomBlock = {
  id: string;
  name: string;
  type: BlockType;
  w: number;
  h: number;
  props: Block["props"];
};

/** 문서 전체 배치 템플릿 */
export type DocTemplate = {
  id: string;
  name: string;
  canvas: EditorDoc["canvas"];
  blocks: Block[];
};

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 용량 초과 등은 무시 (MVP)
  }
}

export const getCustomBlocks = (): CustomBlock[] => read<CustomBlock>(CUSTOM_BLOCKS_KEY);

export function saveCustomBlock(cb: CustomBlock): CustomBlock[] {
  const next = [...getCustomBlocks(), cb];
  write(CUSTOM_BLOCKS_KEY, next);
  return next;
}

export function updateCustomBlock(
  id: string,
  patch: Partial<CustomBlock>,
): CustomBlock[] {
  const next = getCustomBlocks().map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
  write(CUSTOM_BLOCKS_KEY, next);
  return next;
}

export function deleteCustomBlock(id: string): CustomBlock[] {
  const next = getCustomBlocks().filter((c) => c.id !== id);
  write(CUSTOM_BLOCKS_KEY, next);
  return next;
}

export const getTemplates = (): DocTemplate[] => read<DocTemplate>(TEMPLATES_KEY);

export function saveTemplate(t: DocTemplate): DocTemplate[] {
  const next = [...getTemplates(), t];
  write(TEMPLATES_KEY, next);
  return next;
}

export function deleteTemplate(id: string): DocTemplate[] {
  const next = getTemplates().filter((t) => t.id !== id);
  write(TEMPLATES_KEY, next);
  return next;
}

/** 기본 블록의 사용자 지정 기본 속성 (블록 추가 탭에서 수정 — 타입별 오버라이드) */
export type BaseDefaults = Partial<Record<BlockType, AnyBlockProps>>;

export function getBaseDefaults(): BaseDefaults {
  try {
    const raw = localStorage.getItem(BASE_DEFAULTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as BaseDefaults) : {};
  } catch {
    return {};
  }
}

export function saveBaseDefault(
  type: BlockType,
  props: AnyBlockProps,
): BaseDefaults {
  const all = getBaseDefaults();
  all[type] = props;
  try {
    localStorage.setItem(BASE_DEFAULTS_KEY, JSON.stringify(all));
  } catch {
    // 무시 (MVP)
  }
  return all;
}

export function resetBaseDefault(type: BlockType): BaseDefaults {
  const all = getBaseDefaults();
  delete all[type];
  try {
    localStorage.setItem(BASE_DEFAULTS_KEY, JSON.stringify(all));
  } catch {
    // 무시 (MVP)
  }
  return all;
}
