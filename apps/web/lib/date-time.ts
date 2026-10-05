// The product uses a fixed UTC-3 offset, independently of browser/server timezone.
const offsetMs = 3 * 60 * 60 * 1000;
export const displayTimezone = 'UTC−3';

function utcInstant(value: string): number {
  // Never interpret a timestamp without an explicit offset as browser-local time.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN;
  return new Date(value).getTime();
}

export function toFixedOffsetInput(value?: string | null): string {
  if (!value) return '';
  const instant = utcInstant(value);
  if (!Number.isFinite(instant)) return '';
  return new Date(instant - offsetMs).toISOString().slice(0, 23);
}

export function formatFixedOffset(value?: string | null): string {
  if (!value) return 'Registro anterior';
  const local = toFixedOffsetInput(value);
  if (!local) return 'Data indisponível';
  const [date, time] = local.split('T');
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)} ${time.slice(0, 8)}`;
}

export function fromFixedOffsetInput(value: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error('Informe uma data e um horário válidos em UTC−3.');
  const normalized = `${match[1]}T${match[2]}:${match[3]}:${match[4] || '00'}.${(match[5] || '').padEnd(3, '0')}`;
  const instant = new Date(normalized + '-03:00');
  if (!Number.isFinite(instant.getTime()) || toFixedOffsetInput(instant.toISOString()) !== normalized)
    throw new Error('Informe uma data e um horário válidos em UTC−3.');
  return instant.toISOString();
}
