import { NextResponse } from "next/server";

/** 표준 성공 응답: { data } */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

/** 표준 실패 응답: { error } */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
