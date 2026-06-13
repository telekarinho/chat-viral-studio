// Lightweight safety pass. Blocks disallowed content, never blocks legitimate fiction.
// Returns { ok, reasons[] }. Callers decide to reject or sanitize.

const BLOCK_PATTERNS = [
  // explicit claims of being real
  { re: /\b(isto|isso|tudo)\s+(é|e)\s+real\b/i, reason: 'afirma ser real (proibido — conteúdo é ficção)' },
  { re: /\b(print|conversa)\s+real\b/i, reason: 'alega print/conversa real' },
  // illegal / scam how-to
  { re: /\b(como\s+(hackear|clonar|invadir)\s+(whats|conta|cart[aã]o|pix))\b/i, reason: 'instrução ilegal' },
  { re: /\b(passo\s+a\s+passo|tutorial)\b.*\b(golpe|fraude|roubar)\b/i, reason: 'tutorial de golpe' },
  // explicit sexual content (very narrow — fiction/romance is allowed)
  { re: /\b(pornografia\s+expl[ií]cita|sexo\s+expl[ií]cito)\b/i, reason: 'conteúdo sexual explícito' },
];

// Real personal data leakage (CPF, full real phone, etc.)
const PII_PATTERNS = [
  { re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, reason: 'CPF detectado' },
  { re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, reason: 'CNPJ detectado' },
];

export function moderateStory(story) {
  const reasons = [];
  const blob = JSON.stringify(story || {});

  for (const { re, reason } of BLOCK_PATTERNS) if (re.test(blob)) reasons.push(reason);
  for (const { re, reason } of PII_PATTERNS) if (re.test(blob)) reasons.push(reason);

  return { ok: reasons.length === 0, reasons };
}

export function moderateText(text = '') {
  const reasons = [];
  for (const { re, reason } of BLOCK_PATTERNS) if (re.test(text)) reasons.push(reason);
  for (const { re, reason } of PII_PATTERNS) if (re.test(text)) reasons.push(reason);
  return { ok: reasons.length === 0, reasons };
}
