export const normalizePhone = (value?: string | null) => value?.replace(/\D/g, '') || undefined;
export const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || undefined;

export function sameContact(a: { phone?: string | null; email?: string | null }, b: { phone?: string | null; email?: string | null }): boolean {
  const phone = normalizePhone(a.phone);
  const email = normalizeEmail(a.email);
  return Boolean((phone && phone === normalizePhone(b.phone)) || (email && email === normalizeEmail(b.email)));
}

export function validityDeadline(now: Date, hours: number): Date {
  if (!Number.isInteger(hours) || hours < 0 || hours > 87600) throw new Error('Prazo de validade inválido.');
  return new Date(now.getTime() + hours * 3600000);
}
