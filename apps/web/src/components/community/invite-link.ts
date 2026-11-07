/** Invite codes: 6 letters and digits from the server (no 0, O, 1, I). Links are `<origin>/join/<code>`. */

/** Normalise user-typed codes: " 4k-7q29 " → "4K7Q29". */
export function formatCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** Show a code in two groups for reading aloud: "4K7Q29" → "4K7 Q29". */
export function displayCode(code: string): string {
  const c = formatCode(code);
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}
