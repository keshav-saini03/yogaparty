export type CountryCode = {
  code: string;
  label: string;
};

export const COUNTRY_CODES: readonly CountryCode[] = [
  { code: '+91',  label: '🇮🇳 India' },
  { code: '+1',   label: '🇺🇸 US/Canada' },
  { code: '+44',  label: '🇬🇧 UK' },
  { code: '+971', label: '🇦🇪 UAE' },
  { code: '+65',  label: '🇸🇬 Singapore' },
  { code: '+61',  label: '🇦🇺 Australia' },
  { code: '+966', label: '🇸🇦 Saudi Arabia' },
  { code: '+49',  label: '🇩🇪 Germany' },
  { code: '+33',  label: '🇫🇷 France' },
] as const;

export const DEFAULT_COUNTRY_CODE = '+91';
