/** 深度搜尋 JSON 物件裡第一個非 null 的指定 key */
export function deepFind(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  if (key in obj && obj[key] !== null && obj[key] !== undefined) {
    return obj[key];
  }
  for (const value of Object.values(obj)) {
    const hit = deepFind(value, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** 深度收集所有符合條件的物件；matched 回傳 true 時不再往該子樹深入 */
export function deepCollect(
  node: unknown,
  match: (obj: Record<string, unknown>) => boolean,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (node === null || typeof node !== "object") return out;
  if (!Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    if (match(obj)) {
      out.push(obj);
      return out;
    }
  }
  for (const value of Object.values(node)) {
    deepCollect(value, match, out);
  }
  return out;
}

/** 把可能是多行 JSON stream 的 body 逐行 parse（FB 用這種格式） */
export function parseJsonLines(text: string): unknown[] {
  const docs: unknown[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      docs.push(JSON.parse(trimmed));
    } catch {
      // 不是完整 JSON 的行直接略過
    }
  }
  // 整段是單一 JSON 但含換行的情況
  if (docs.length === 0) {
    try {
      docs.push(JSON.parse(text));
    } catch {
      /* ignore */
    }
  }
  return docs;
}
