export function whatsappLink(phone?: string | null): string | null {
  if (!phone?.trim().startsWith("+")) return null;
  const digits = phone.replace(/[\s()+.-]/g, "");
  return /^[1-9]\d{6,14}$/.test(digits) ? `https://wa.me/${digits}` : null;
}
