/**
 * Bidi isolate for numbers with units/signs ("−1.5 °C", "৳ 3,25,400") inside RTL text: FSI … PDI
 * makes the browser lay the value out by its own first strong character, so Urdu/Arabic don't
 * reorder it into "C° 1.5−".
 */
export const iso = (s: string) => `⁨${s}⁩`;
