import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/country-codes';

// The native <select>'s closed-state width tends to grow to fit its widest
// option (e.g. "+966 🇸🇦 Saudi Arabia"), which on the form starves the phone
// input. We render only `code + flag` in options so every label is short
// and uniform, then cap the rendered width so the layout is predictable.
function flagFromLabel(label: string): string {
  // COUNTRY_CODES entries look like "🇮🇳 India" — the flag is the first
  // grapheme. Splitting on the first space is safe across all entries.
  const space = label.indexOf(' ');
  return space === -1 ? label : label.slice(0, space);
}

export function CountryCodeSelect() {
  return (
    <select
      name="country_code"
      defaultValue={DEFAULT_COUNTRY_CODE}
      aria-label="Country code"
      className="field field-mono"
      style={{
        flexShrink: 0,
        width: '6.25rem',
        paddingRight: '0.5rem',
      }}
    >
      {COUNTRY_CODES.map((c) => (
        <option key={c.code} value={c.code}>
          {flagFromLabel(c.label)} {c.code}
        </option>
      ))}
    </select>
  );
}
