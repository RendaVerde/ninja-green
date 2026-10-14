export function normalizeWhatsAppPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^550\d{10,11}$/.test(digits)) digits = `55${digits.slice(3)}`;
  if (/^0\d{10,11}$/.test(digits)) digits = digits.slice(1);
  if (/^\d{10,11}$/.test(digits)) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : "";
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message.trim())}`;
}
