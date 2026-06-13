// Server-side moderation (Next.js API routes). Blocks disallowed content, allows fiction.
const BLOCK: { re: RegExp; reason: string }[] = [
  { re: /\b(isto|isso|tudo)\s+(é|e)\s+real\b/i, reason: 'afirma ser real (conteúdo é ficção)' },
  { re: /\b(print|conversa)\s+real\b/i, reason: 'alega print/conversa real' },
  { re: /\b(como\s+(hackear|clonar|invadir)\s+(whats|conta|cart[aã]o|pix))\b/i, reason: 'instrução ilegal' },
  { re: /\b(passo\s+a\s+passo|tutorial)\b.*\b(golpe|fraude|roubar)\b/i, reason: 'tutorial de golpe' },
  { re: /\b(pornografia\s+expl[ií]cita|sexo\s+expl[ií]cito)\b/i, reason: 'conteúdo sexual explícito' },
  { re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, reason: 'CPF detectado' },
  { re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, reason: 'CNPJ detectado' },
];

export function moderate(input: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const { re, reason } of BLOCK) if (re.test(input)) reasons.push(reason);
  return { ok: reasons.length === 0, reasons };
}
