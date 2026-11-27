// 불편한 부위 고르기용 몸 그림 (해부도 스타일, 자체 제작). 왼쪽 절반을 그리고 좌우 반전한다. viewBox 0 0 200 400
import type { Limitation } from "@shared/scoring";
export type BodyShape = { d: string; region?: Limitation; center?: boolean; head?: boolean };
const E = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
// 바탕 실루엣(근육 사이 틈 색)
export const BODY_BASE: string[] = [
  "M100 10 Q82 10 82 34 Q82 50 90 56 L89 66 Q72 74 60 76 Q42 80 41 100 Q40 112 44 120 Q38 150 40 168 Q34 196 37 216 Q32 236 37 250 Q44 258 50 250 Q55 234 52 218 Q60 190 58 168 Q64 142 64 116 L68 112 Q70 150 74 168 Q63 214 69 268 Q66 322 75 358 Q70 372 66 384 Q80 390 96 384 L92 358 Q98 320 95 270 Q99 230 98 202 L100 202 Z",
];
export const BODY_FRONT: BodyShape[] = [
  { d: E(100, 34, 17, 21), center: true, head: true },
  { d: "M91 55 L90 70 Q100 76 110 70 L109 55 Q100 61 91 55 Z", region: "neck" as const, center: true },
  { d: "M89 68 Q76 74 64 77 L88 80 Z", region: "neck" as const },
  { d: "M62 78 Q47 81 45 99 Q46 110 51 115 Q56 100 66 90 Q66 83 62 78 Z", region: "shoulder" as const },
  { d: "M68 83 Q81 78 98 82 L98 108 Q84 114 70 106 Q64 96 68 83 Z" },
  { d: "M87 113 h11 v13 h-11 Z" }, { d: "M87 128 h11 v14 h-11 Z" }, { d: "M87 144 h11 v14 h-11 Z" }, { d: "M88 160 h10 v18 q-6 -2 -10 -9 Z" },
  { d: "M70 109 Q73 134 78 160 L85 165 L85 113 Q77 113 70 109 Z" },
  { d: "M50 118 Q43 140 44 160 L54 163 Q60 142 62 120 Z" },
  { d: "M44 166 Q38 186 39 206 L45 207 Q49 186 52 167 Z" }, { d: "M53 168 Q50 188 47 207 L51 207 Q57 188 56 169 Z" },
  { d: "M38 209 L52 209 L51 219 L38 218 Z", region: "wrist" as const },
  { d: "M38 221 Q34 236 38 247 Q43 252 47 247 Q51 235 51 222 Z" },
  { d: "M77 166 Q86 178 98 186 L98 197 Q84 193 73 179 Q74 171 77 166 Z", region: "hip" as const },
  { d: "M72 182 Q64 212 70 262 L78 262 Q76 220 82 192 Z" },
  { d: "M84 194 Q78 228 81 262 L88 262 Q93 228 90 198 Z" },
  { d: "M92 199 Q96 228 90 262 L94 262 Q99 228 97 202 Z" },
  { d: E(83, 274, 10, 9), region: "knee" as const },
  { d: "M73 286 Q69 320 76 352 L82 352 Q80 320 82 288 Z" }, { d: "M84 288 Q88 320 84 352 L89 352 Q95 320 93 286 Z" },
  { d: "M76 355 L89 355 L89 364 L76 364 Z", region: "ankle" as const },
  { d: "M76 367 L89 367 L93 381 Q80 386 68 381 Q70 372 76 367 Z" },
];
export const BODY_BACK: BodyShape[] = [
  { d: E(100, 34, 17, 21), center: true, head: true },
  { d: "M91 55 L90 68 Q100 72 110 68 L109 55 Q100 61 91 55 Z", region: "neck" as const, center: true },
  { d: "M99 70 L89 68 Q75 75 63 78 L80 92 L99 124 Z", region: "neck" as const },
  { d: "M62 78 Q47 81 45 99 Q46 110 51 115 Q56 100 66 90 Q66 83 62 78 Z", region: "shoulder" as const },
  { d: "M69 95 Q64 128 78 154 L98 148 L98 130 L81 98 Z" },
  { d: "M86 145 h12 v24 h-12 Q83 157 86 145 Z", region: "back" as const },
  { d: "M78 157 L84 151 L84 171 L75 172 Z", region: "back" as const },
  { d: "M50 118 Q43 140 44 160 L54 163 Q60 142 62 120 Z" },
  { d: "M44 166 Q38 186 39 206 L45 207 Q49 186 52 167 Z" }, { d: "M53 168 Q50 188 47 207 L51 207 Q57 188 56 169 Z" },
  { d: "M38 209 L52 209 L51 219 L38 218 Z", region: "wrist" as const },
  { d: "M38 221 Q34 236 38 247 Q43 252 47 247 Q51 235 51 222 Z" },
  { d: "M75 174 Q69 202 98 204 L98 174 Q86 170 75 174 Z", region: "hip" as const },
  { d: "M72 207 Q65 236 71 266 L83 266 Q83 236 85 209 Z" }, { d: "M87 209 Q86 238 85 266 L94 266 Q99 236 97 208 Z" },
  { d: E(83, 274, 10, 7), region: "knee" as const },
  { d: "M73 283 Q66 305 74 330 L82 328 Q82 302 82 285 Z" }, { d: "M84 285 Q86 302 84 328 L91 330 Q98 305 93 283 Z" },
  { d: "M76 333 Q78 344 77 352 L88 352 Q87 344 89 333 Q83 338 76 333 Z" },
  { d: "M76 355 L89 355 L89 364 L76 364 Z", region: "ankle" as const },
  { d: "M76 367 L89 367 L93 381 Q80 386 68 381 Q70 372 76 367 Z" },
];
