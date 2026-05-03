import type { Database } from 'bun:sqlite';
import type { CorvynConfig } from './config';
import * as fs from 'fs';

export type { Database };

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  rate: number;
  decimals: number;
  source: 'auto' | 'manual' | 'default';
}

export const CURRENCY_SYMBOLS: Record<string, { symbol: string; name: string; decimals: number }> = {
  INR: { symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  PKR: { symbol: '₨', name: 'Pakistani Rupee', decimals: 0 },
  BDT: { symbol: '৳', name: 'Bangladeshi Taka', decimals: 2 },
  LKR: { symbol: 'Rs', name: 'Sri Lankan Rupee', decimals: 2 },
  NPR: { symbol: 'रू', name: 'Nepalese Rupee', decimals: 2 },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 0 },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2 },
  PHP: { symbol: '₱', name: 'Philippine Peso', decimals: 2 },
  THB: { symbol: '฿', name: 'Thai Baht', decimals: 2 },
  VND: { symbol: '₫', name: 'Vietnamese Dong', decimals: 0 },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  MMK: { symbol: 'K', name: 'Myanmar Kyat', decimals: 0 },
  KHR: { symbol: '៛', name: 'Cambodian Riel', decimals: 0 },
  BND: { symbol: 'B$', name: 'Brunei Dollar', decimals: 2 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  KRW: { symbol: '₩', name: 'South Korean Won', decimals: 0 },
  TWD: { symbol: 'NT$', name: 'Taiwan Dollar', decimals: 0 },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2 },
  MNT: { symbol: '₮', name: 'Mongolian Tögrög', decimals: 0 },
  KZT: { symbol: '₸', name: 'Kazakhstani Tenge', decimals: 2 },
  UZS: { symbol: 'soʻm', name: 'Uzbekistani Som', decimals: 0 },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', decimals: 2 },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', decimals: 2 },
  QAR: { symbol: 'ر.ق', name: 'Qatari Riyal', decimals: 2 },
  KWD: { symbol: 'د.ك', name: 'Kuwaiti Dinar', decimals: 3 },
  BHD: { symbol: 'BD', name: 'Bahraini Dinar', decimals: 3 },
  OMR: { symbol: '﷼', name: 'Omani Rial', decimals: 3 },
  JOD: { symbol: 'JD', name: 'Jordanian Dinar', decimals: 3 },
  ILS: { symbol: '₪', name: 'Israeli Shekel', decimals: 2 },
  TRY: { symbol: '₺', name: 'Turkish Lira', decimals: 2 },
  IRR: { symbol: '﷼', name: 'Iranian Rial', decimals: 0 },
  NGN: { symbol: '₦', name: 'Nigerian Naira', decimals: 2 },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2 },
  GHS: { symbol: '₵', name: 'Ghanaian Cedi', decimals: 2 },
  ZAR: { symbol: 'R', name: 'South African Rand', decimals: 2 },
  EGP: { symbol: '£', name: 'Egyptian Pound', decimals: 2 },
  ETB: { symbol: 'Br', name: 'Ethiopian Birr', decimals: 2 },
  TZS: { symbol: 'TSh', name: 'Tanzanian Shilling', decimals: 0 },
  UGX: { symbol: 'USh', name: 'Ugandan Shilling', decimals: 0 },
  RWF: { symbol: 'Fr', name: 'Rwandan Franc', decimals: 0 },
  XOF: { symbol: 'CFA', name: 'West African CFA', decimals: 0 },
  XAF: { symbol: 'FCFA', name: 'Central African CFA', decimals: 0 },
  MAD: { symbol: 'MAD', name: 'Moroccan Dirham', decimals: 2 },
  DZD: { symbol: 'دج', name: 'Algerian Dinar', decimals: 2 },
  ZMW: { symbol: 'ZK', name: 'Zambian Kwacha', decimals: 2 },
  USD: { symbol: '$', name: 'US Dollar', decimals: 2 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  MXN: { symbol: 'MX$', name: 'Mexican Peso', decimals: 2 },
  BRL: { symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  ARS: { symbol: '$', name: 'Argentine Peso', decimals: 2 },
  CLP: { symbol: '$', name: 'Chilean Peso', decimals: 0 },
  COP: { symbol: '$', name: 'Colombian Peso', decimals: 0 },
  PEN: { symbol: 'S/', name: 'Peruvian Sol', decimals: 2 },
  VES: { symbol: 'Bs.', name: 'Venezuelan Bolívar', decimals: 2 },
  CRC: { symbol: '₡', name: 'Costa Rican Colón', decimals: 0 },
  GTQ: { symbol: 'Q', name: 'Guatemalan Quetzal', decimals: 2 },
  BOB: { symbol: 'Bs', name: 'Bolivian Boliviano', decimals: 2 },
  PYG: { symbol: '₲', name: 'Paraguayan Guaraní', decimals: 0 },
  UYU: { symbol: '$U', name: 'Uruguayan Peso', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', decimals: 2 },
  CHF: { symbol: 'Fr', name: 'Swiss Franc', decimals: 2 },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', decimals: 2 },
  SEK: { symbol: 'kr', name: 'Swedish Krona', decimals: 2 },
  DKK: { symbol: 'kr', name: 'Danish Krone', decimals: 2 },
  PLN: { symbol: 'zł', name: 'Polish Złoty', decimals: 2 },
  CZK: { symbol: 'Kč', name: 'Czech Koruna', decimals: 2 },
  HUF: { symbol: 'Ft', name: 'Hungarian Forint', decimals: 0 },
  RON: { symbol: 'lei', name: 'Romanian Leu', decimals: 2 },
  BGN: { symbol: 'лв', name: 'Bulgarian Lev', decimals: 2 },
  HRK: { symbol: 'kn', name: 'Croatian Kuna', decimals: 2 },
  RSD: { symbol: 'din', name: 'Serbian Dinar', decimals: 2 },
  UAH: { symbol: '₴', name: 'Ukrainian Hryvnia', decimals: 2 },
  RUB: { symbol: '₽', name: 'Russian Ruble', decimals: 2 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },
  FJD: { symbol: 'FJ$', name: 'Fijian Dollar', decimals: 2 },
};

const LOCALE_CURRENCY_MAP: Record<string, { code: string; symbol: string }> = {
  'en-US': { code: 'USD', symbol: '$' },
  'en-GB': { code: 'GBP', symbol: '£' },
  'en-IN': { code: 'INR', symbol: '₹' },
  'en-AU': { code: 'AUD', symbol: 'A$' },
  'en-CA': { code: 'CAD', symbol: 'C$' },
  'en-NZ': { code: 'NZD', symbol: 'NZ$' },
  'en-ZA': { code: 'ZAR', symbol: 'R' },
  'zh-CN': { code: 'CNY', symbol: '¥' },
  'zh-TW': { code: 'TWD', symbol: 'NT$' },
  'ja-JP': { code: 'JPY', symbol: '¥' },
  'ko-KR': { code: 'KRW', symbol: '₩' },
  'de-DE': { code: 'EUR', symbol: '€' },
  'fr-FR': { code: 'EUR', symbol: '€' },
  'es-ES': { code: 'EUR', symbol: '€' },
  'it-IT': { code: 'EUR', symbol: '€' },
  'pt-BR': { code: 'BRL', symbol: 'R$' },
  'ru-RU': { code: 'RUB', symbol: '₽' },
  'ar-SA': { code: 'SAR', symbol: '﷼' },
  'th-TH': { code: 'THB', symbol: '฿' },
  'vi-VN': { code: 'VND', symbol: '₫' },
  'id-ID': { code: 'IDR', symbol: 'Rp' },
  'ms-MY': { code: 'MYR', symbol: 'RM' },
  'fil-PH': { code: 'PHP', symbol: '₱' },
  'tr-TR': { code: 'TRY', symbol: '₺' },
  'nl-NL': { code: 'EUR', symbol: '€' },
  'sv-SE': { code: 'SEK', symbol: 'kr' },
  'pl-PL': { code: 'PLN', symbol: 'zł' },
  'he-IL': { code: 'ILS', symbol: '₪' },
  'cs-CZ': { code: 'CZK', symbol: 'Kč' },
  'hu-HU': { code: 'HUF', symbol: 'Ft' },
  'ro-RO': { code: 'RON', symbol: 'lei' },
  'uk-UA': { code: 'UAH', symbol: '₴' },
  'da-DK': { code: 'DKK', symbol: 'kr' },
  'no-NO': { code: 'NOK', symbol: 'kr' },
  'fi-FI': { code: 'EUR', symbol: '€' },
};

function detectLocale(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    return resolved.locale ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

function localeToCurrency(locale: string): { code: string; symbol: string } {
  const direct = LOCALE_CURRENCY_MAP[locale];
  if (direct) {
    return direct;
  }

  const lang = locale.split('-')[0] ?? '';
  for (const [key, value] of Object.entries(LOCALE_CURRENCY_MAP)) {
    if (key.startsWith(lang)) {
      return value;
    }
  }

  return { code: 'USD', symbol: '$' };
}

export function isValidCurrencyCode(code: string): boolean {
  return code in CURRENCY_SYMBOLS;
}

export function getAllCurrencyCodes(): { code: string; symbol: string; name: string }[] {
  return Object.entries(CURRENCY_SYMBOLS).map(([code, info]) => ({
    code,
    symbol: info.symbol,
    name: info.name,
  })).sort((a, b) => a.code.localeCompare(b.code));
}

export function getBudgetSuggestion(code: string): number {
  const suggestions: Record<string, number> = {
    INR: 30, NGN: 1500, BRL: 8, USD: 2, EUR: 2, GBP: 2,
    JPY: 300, KRW: 3000, CNY: 15, SGD: 3, MYR: 10, PHP: 120,
    THB: 75, VND: 50000, IDR: 35000, PKR: 600, BDT: 250,
    ZAR: 40, AED: 8, SAR: 8, CAD: 3, AUD: 3, CHF: 2,
    TRY: 60, RUB: 180, MXN: 40, ARS: 2000, CLP: 1800,
    COP: 9000, PEN: 8, KES: 300, GHS: 25, EGP: 100,
    TZS: 5000, UGX: 8000, XOF: 1200, XAF: 1200, MAD: 20,
    DZD: 300, ZMW: 45, ETB: 120, RWF: 2500, KZT: 1000,
    UZS: 25000, TWD: 70, HKD: 16, MNT: 7000, BHD: 1,
    KWD: 0.6, QAR: 8, OMR: 0.8, JOD: 1.5, ILS: 8,
    LKR: 700, NPR: 270, MMK: 4000, KHR: 8000, BND: 3,
    CRC: 1000, GTQ: 16, BOB: 15, PYG: 15000, UYU: 80,
    NOK: 22, SEK: 22, DKK: 14, PLN: 9, CZK: 45,
    HUF: 700, RON: 10, BGN: 4, HRK: 15, RSD: 220,
    FJD: 5, VES: 80,
  };
  return suggestions[code] ?? 30;
}

async function fetchExchangeRate(code: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.exchangerate-api.com/v4/latest/USD`
    );
    if (!res.ok) {
      return 1;
    }
    const data = (await res.json()) as { rates: Record<string, number> };
    return data.rates[code] ?? 1;
  } catch {
    return 1;
  }
}

function getCachedRate(db: Database, code: string): { rate: number } | null {
  const row = db
    .prepare(
      'SELECT currency_code, rate, fetched_at FROM exchange_rates WHERE currency_code = ?'
    )
    .get(code) as
    | { currency_code: string; rate: number; fetched_at: string }
    | undefined;

  if (!row) {
    return null;
  }

  const fetched = new Date(row.fetched_at).getTime();
  const now = Date.now();
  const hoursSinceFetch = (now - fetched) / (1000 * 60 * 60);

  if (hoursSinceFetch > 24) {
    return null;
  }

  return { rate: row.rate };
}

function cacheRate(db: Database, code: string, rate: number): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO exchange_rates (currency_code, rate, symbol, fetched_at) VALUES (?, ?, ?, ?)'
  ).run(code, rate, '', now);
}

function getAutoCurrency(): { code: string; symbol: string; name: string; decimals: number } {
  const locale = detectLocale();
  const mapped = localeToCurrency(locale);
  const info = CURRENCY_SYMBOLS[mapped.code];
  return {
    code: mapped.code,
    symbol: info ? info.symbol : mapped.symbol,
    name: info ? info.name : mapped.code,
    decimals: info ? info.decimals : 2,
  };
}

export async function getCurrency(db: Database, config?: CorvynConfig): Promise<CurrencyInfo> {
  let code: string;
  let symbol: string;
  let name: string;
  let decimals: number;
  let source: CurrencyInfo['source'];

  if (config && config.currency.mode === 'manual' && config.currency.override) {
    const overrideCode = config.currency.override.toUpperCase();
    if (isValidCurrencyCode(overrideCode)) {
      const info = CURRENCY_SYMBOLS[overrideCode]!;
      code = overrideCode;
      symbol = info.symbol;
      name = info.name;
      decimals = info.decimals;
      source = 'manual';
    } else {
      console.warn(`Unknown currency code: ${overrideCode}. Falling back to auto detection.`);
      console.warn('Valid codes: ' + Object.keys(CURRENCY_SYMBOLS).sort().join(', '));
      const auto = getAutoCurrency();
      code = auto.code;
      symbol = auto.symbol;
      name = auto.name;
      decimals = auto.decimals;
      source = 'default';
    }
  } else {
    const auto = getAutoCurrency();
    code = auto.code;
    symbol = auto.symbol;
    name = auto.name;
    decimals = auto.decimals;
    source = 'auto';
  }

  const cached = getCachedRate(db, code);
  if (cached) {
    return { code, symbol, name, rate: cached.rate, decimals, source };
  }

  const rate = await fetchExchangeRate(code);
  cacheRate(db, code, rate);

  return { code, symbol, name, rate, decimals, source };
}

export function formatCost(usd: number, currency: CurrencyInfo): string {
  const local = usd * currency.rate;
  const decimals = currency.decimals ?? 2;

  if (decimals === 0) {
    return `${currency.symbol}${Math.round(local).toLocaleString('en-US')}`;
  }

  const formatted = local.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${currency.symbol}${formatted}`;
}

export function getCurrencyInfoSync(): { code: string; symbol: string; name: string; decimals: number } {
  return getAutoCurrency();
}

export function updateCurrencyOverride(configPath: string, code: string): boolean {
  if (!isValidCurrencyCode(code)) {
    return false;
  }

  if (!fs.existsSync(configPath)) {
    return false;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const lines = content.split('\n');
  let inCurrency = false;
  let foundOverride = false;
  let foundMode = false;
  let currencySectionEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().startsWith('[currency]')) {
      inCurrency = true;
      continue;
    }
    if (inCurrency && line.trim().startsWith('[')) {
      currencySectionEnd = i;
      break;
    }
    if (inCurrency && line.trim().startsWith('mode')) {
      lines[i] = `mode = "manual"`;
      foundMode = true;
    }
    if (inCurrency && line.trim().startsWith('override')) {
      lines[i] = `override = "${code}"`;
      foundOverride = true;
    }
  }

  // If fields were missing, insert them after [currency]
  if (inCurrency && (!foundOverride || !foundMode)) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith('[currency]')) {
        const toInsert: string[] = [];
        if (!foundMode) toInsert.push(`mode = "manual"`);
        if (!foundOverride) toInsert.push(`override = "${code}"`);
        lines.splice(i + 1, 0, ...toInsert);
        break;
      }
    }
  }

  fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');
  return true;
}
