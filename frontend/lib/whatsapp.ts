// Enlaces wa.me para abrir WhatsApp con un mensaje precargado. El mensaje sale
// del WhatsApp de quien lo envía (no de la API de la clínica), así que no
// requiere plantillas aprobadas por Meta ni ventana de 24 h.

// Número en formato internacional sin "+". Argentina: los celulares en WhatsApp
// llevan 9 después del 54 (54 9 11 …); se agrega si falta. Un número local de
// 10 dígitos (área + número) se asume argentino.
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `549${digits}`;
  else if (digits.startsWith("54") && !digits.startsWith("549") && digits.length === 12) {
    digits = `549${digits.slice(2)}`;
  }
  return digits.length >= 8 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
