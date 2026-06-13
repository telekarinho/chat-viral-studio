import type { GenerateParams } from './types';

// 10 ready-made viral templates → pre-filled generation params.
export interface Template {
  id: string;
  title: string;
  emoji: string;
  params: GenerateParams;
}

export const TEMPLATES: Template[] = [
  { id: 'namorada-ciumenta', title: 'Namorada ciumenta', emoji: '💚', params: { category: 'ciúmes', duration: 45, intensity: 'médio', emotion: 'drama leve', ending: 'plot twist', messageCount: 14 } },
  { id: 'cliente-sem-nocao', title: 'Cliente sem noção', emoji: '🤯', params: { category: 'cliente maluco', duration: 45, intensity: 'absurdo', emotion: 'vergonha alheia', ending: 'engraçado', messageCount: 14 } },
  { id: 'mae-grupo-familia', title: 'Mãe no grupo da família', emoji: '👩‍👧', params: { category: 'grupo da família', duration: 30, intensity: 'médio', emotion: 'engraçado', ending: 'engraçado', messageCount: 12 } },
  { id: 'chefe-abusado', title: 'Chefe abusado (cômico)', emoji: '💼', params: { category: 'chefe sem noção', duration: 45, intensity: 'médio', emotion: 'vergonha alheia', ending: 'plot twist', messageCount: 14 } },
  { id: 'vizinho-misterioso', title: 'Vizinho misterioso', emoji: '🚪', params: { category: 'vizinho estranho', duration: 60, intensity: 'médio', emotion: 'suspense', ending: 'chocante', messageCount: 16 } },
  { id: 'conversa-errada', title: 'Conversa que terminou errada', emoji: '💔', params: { category: 'namoro', duration: 45, intensity: 'médio', emotion: 'drama leve', ending: 'chocante', messageCount: 14 } },
  { id: 'pix-absurdo', title: 'Pedido de PIX absurdo', emoji: '💸', params: { category: 'golpe engraçado', duration: 30, intensity: 'absurdo', emotion: 'engraçado', ending: 'engraçado', messageCount: 12 } },
  { id: 'entrega-confusao', title: 'Entrega que virou confusão', emoji: '📦', params: { category: 'entrega', duration: 45, intensity: 'médio', emotion: 'engraçado', ending: 'plot twist', messageCount: 14 } },
  { id: 'parte1-suspense', title: 'Parte 1 — suspense', emoji: '🕵️', params: { category: 'suspense leve', duration: 60, intensity: 'médio', emotion: 'suspense', ending: 'continuação parte 2', messageCount: 16 } },
  { id: 'parte2-revelacao', title: 'Parte 2 — revelação', emoji: '🎭', params: { category: 'segredo revelado', duration: 60, intensity: 'absurdo', emotion: 'suspense', ending: 'chocante', messageCount: 16 } },
];
