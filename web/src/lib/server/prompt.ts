// Server-side prompt builder (used by Next.js API routes — Vercel single-project mode).
export const CATEGORIES = [
  'namoro', 'ciúmes', 'família', 'cliente maluco', 'chefe sem noção',
  'vizinho estranho', 'grupo da família', 'golpe engraçado', 'compra errada',
  'restaurante', 'entrega', 'escola', 'trabalho', 'casamento',
  'segredo revelado', 'caso absurdo', 'suspense leve', 'comédia',
];

const SCHEMA_HINT = `Responda APENAS com JSON válido (sem markdown), no formato:
{"title":"","hook":"","characters":[{"id":"c1","name":"","side":"left","online":true},{"id":"c2","name":"Você","side":"right","online":true}],
"messages":[{"sender":"c1","type":"text","text":"","emotion":"neutro","delay":1.2,"time":"21:48","status":"read"}],
"narration":"","hashtags":["#viral"],"caption":"","part2_hook":""}`;

export function buildStoryPrompt(p: any = {}) {
  const { category = 'comédia', duration = 45, intensity = 'médio', emotion = 'engraçado', ending = 'plot twist', messageCount = 14 } = p;
  return `Você é roteirista de vídeos virais verticais. Crie uma HISTÓRIA 100% FICTÍCIA em formato de conversa de app de mensagens.
REGRAS: ficção/dramatização; sem nomes reais; sem dados pessoais, golpes aplicáveis, instruções ilegais, conteúdo sexual explícito, ódio ou humilhação real.
PARÂMETROS: categoria=${category}; duração=${duration}s; intensidade=${intensity}; emoção=${emotion}; final=${ending}; ~${messageCount} mensagens.
QUALIDADE: gancho forte na 1ª msg; falas curtas alternando 2 personagens; tensão crescente até o final ${ending}; "delay" 0.6–2.5s somando ≈${duration}s; "emotion"∈[neutro,alegria,raiva,medo,surpresa,tristeza,ironia]; "time" HH:MM crescente.
${SCHEMA_HINT}`;
}

export function buildTextToChatPrompt(text: string, p: any = {}) {
  const { emotion = 'engraçado' } = p;
  return `Transforme o TEXTO numa conversa fictícia de app de mensagens entre 2 personagens. Mensagens curtas alternando remetentes, com pausas (delay) e horários. Emoção dominante: ${emotion}. Trate como ficção.
TEXTO: """${(text || '').slice(0, 4000)}"""
${SCHEMA_HINT}`;
}

export function buildViralScorePrompt(story: any) {
  return `Avalie este roteiro viral. Responda APENAS JSON:
{"hook":0-100,"curiosity":0-100,"retention":0-100,"emotion":0-100,"ending":0-100,"part2":0-100,"total":0-100,"suggestions":["..."]}
ROTEIRO: ${JSON.stringify({ title: story?.title, hook: story?.hook, messages: story?.messages?.slice(0, 30), part2_hook: story?.part2_hook }).slice(0, 6000)}`;
}
