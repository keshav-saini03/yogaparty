import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/country-codes';

export function CountryCodeSelect() {
  return (
    <select
      name="country_code"
      defaultValue={DEFAULT_COUNTRY_CODE}
      aria-label="Country code"
      className="h-11 rounded-md border border-gray-300 px-2 bg-white"
    >
      {COUNTRY_CODES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} {c.label}
        </option>
      ))}
    </select>
  );
}
