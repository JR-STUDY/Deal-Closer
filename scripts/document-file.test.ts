/**
 * `src/lib/document-file.ts` 검증 (DB·브라우저 없이 순수 함수만).
 * 실행: pnpm test:document-file
 *
 * 이 모듈이 지켜야 할 것은 셋이다 —
 * ① 첨부·다운로드·발송 화면이 **같은 파일명**을 얻는다 (화면에 보이는 이름과 실제로 나가는
 *    파일 이름이 갈라지면 담당자는 무엇을 보냈는지 확인할 방법이 없다) ·
 * ② 제목은 전부 사용자 입력이라 경로 구분자·예약 문자를 **걸러낸다** ·
 * ③ 한글 파일명은 `filename` 과 `filename*`(RFC 5987)을 **함께** 준다 (하나만 주면
 *    한쪽 클라이언트에서 이름이 깨진다).
 */

import assert from "node:assert/strict";
import {
  PDF_CONTENT_TYPE,
  contentDisposition,
  documentPdfFileName,
} from "../src/lib/document-file";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}

// ────────────────────────── 파일명 ──────────────────────────

check(
  documentPdfFileName({ title: "다올테크 도입 견적", type: "QUOTE" }),
  "[견적서] 다올테크 도입 견적.pdf",
  "종류 라벨 + 제목 + .pdf",
);

// 정의 밖 종류는 **지어내지 않고** 원문을 쓴다 (DB 의 type 은 String 이다)
check(
  documentPdfFileName({ title: "협의안", type: "WHATEVER" }),
  "[WHATEVER] 협의안.pdf",
  "모르는 종류는 원문을 그대로 적는다",
);

// ── 경로 구분자·예약 문자 — 그대로 헤더에 넣으면 저장이 실패하거나 경로로 해석된다 ──
for (const bad of ["/", "\\", ":", "*", "?", '"', "<", ">", "|"]) {
  const name = documentPdfFileName({ title: `a${bad}b`, type: "QUOTE" });
  check(
    name.includes(bad),
    false,
    `파일명에 "${bad}" 가 남지 않는다 (${name})`,
  );
}
check(
  documentPdfFileName({ title: "../../etc/passwd", type: "QUOTE" }),
  "[견적서] .. .. etc passwd.pdf",
  "경로 탈출 시도는 구분자가 걸러져 한 이름으로 남는다",
);
check(
  documentPdfFileName({ title: "a\\\\\\\\b//c", type: "QUOTE" }),
  "[견적서] a b c.pdf",
  "연속 구분자는 공백 하나로 접힌다",
);

// ── 길이 상한 — 일부 파일시스템이 255바이트를 넘기지 못한다 ──
{
  const name = documentPdfFileName({ title: "가".repeat(300), type: "QUOTE" });
  check(name.length, 124, "확장자 제외 120자로 자른다");
  ok(name.endsWith(".pdf"), "잘려도 확장자는 남는다");
  check(name.includes(" .pdf"), false, "잘린 끝의 공백은 걷어낸다");
}

// ── 빈 이름을 만들지 않는다 — `.pdf` 만 남으면 받는 쪽에서 숨은 파일이 된다 ──
check(
  documentPdfFileName({ title: "///", type: "///" }),
  "문서.pdf",
  "제목·종류가 통째로 걸러지면 대체 이름 하나만 남는다 (`[ ].pdf` 가 되지 않는다)",
);
check(
  documentPdfFileName({ title: "  ", type: "QUOTE" }),
  "[견적서] 문서.pdf",
  "제목만 비면 그 자리를 대체 이름으로 채운다",
);

// ────────────────────────── Content-Disposition ──────────────────────────

{
  const header = contentDisposition("[견적서] 다올테크.pdf");
  ok(header.startsWith("attachment;"), "기본은 내려받기다");
  ok(
    header.includes(`filename*=UTF-8''${encodeURIComponent("[견적서] 다올테크.pdf")}`),
    "한글 이름은 filename* 로 함께 준다 (RFC 5987)",
  );
  ok(
    /filename="[ -~]*"/.test(header),
    "filename 쪽은 ASCII 로만 적는다 (구형 클라이언트용)",
  );
  check(
    header.includes("견적서.pdf\""),
    false,
    "ASCII 폴백에 한글이 그대로 남지 않는다",
  );
}

check(
  contentDisposition("a.pdf", "inline").startsWith("inline;"),
  true,
  "inline 을 주면 새 탭에서 바로 보여준다",
);

// 따옴표가 남으면 헤더가 조기에 닫혀 이름이 잘린다
{
  const header = contentDisposition('a"b.pdf');
  check(
    (header.match(/"/g) ?? []).length,
    2,
    "filename 값을 감싸는 따옴표 두 개만 남는다",
  );
}

// ────────────────────────── MIME ──────────────────────────
check(PDF_CONTENT_TYPE, "application/pdf", "PDF MIME 타입은 한 곳에서 온다");

console.log(`document-file: ${checks} checks passed`);
