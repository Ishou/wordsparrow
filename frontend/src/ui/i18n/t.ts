import { fr } from './messages.fr';

type Messages = typeof fr;
type RawKey = keyof Messages & string;

type StripPluralSuffix<K extends string> = K extends `${infer B}_one`
  ? B
  : K extends `${infer B}_other`
    ? B
    : K extends `${infer B}_zero`
      ? B
      : K extends `${infer B}_two`
        ? B
        : K extends `${infer B}_few`
          ? B
          : K extends `${infer B}_many`
            ? B
            : K;

export type MessageKey = StripPluralSuffix<RawKey>;
export type TParams = Record<string, string | number>;

const pluralRules = new Intl.PluralRules('fr');

export function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function resolveRawKey(key: string, params?: TParams): string {
  if (params && typeof params.count === 'number') {
    const withCategory = `${key}_${pluralRules.select(params.count)}`;
    if (withCategory in fr) return withCategory;
    const other = `${key}_other`;
    if (other in fr) return other;
  }
  return key;
}

export function t(key: MessageKey, params?: TParams): string {
  const template = (fr as Record<string, string>)[resolveRawKey(key, params)];
  if (template === undefined) return key;
  return interpolate(template, params);
}
