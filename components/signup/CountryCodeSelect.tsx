import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/country-codes';

export function CountryCodeSelect() {
  return (
    <select
      name="country_code"
      defaultValue={DEFAULT_COUNTRY_CODE}
      aria-label="Country code"
      className="field field-mono w-auto pr-2"
      style={{ flexShrink: 0 }}
    >
      {COUNTRY_CODES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} {c.label}
        </option>
      ))}
    </select>
  );
}
