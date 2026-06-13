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
  const { category = 'comédia', duration = 40, intensity = 'médio', emotion = 'engraçado', ending = 'plot twist', messageCount = 14 } = p;
  return `Você é o MELHOR roteirista de vídeos virais de TikTok/Reels do Brasil. Crie uma HISTÓRIA 100% FICTÍCIA em formato de conversa de WhatsApp que prenda do 1º ao último segundo.

PARÂMETROS: categoria=${category}; duração≈${duration}s; intensidade=${intensity}; clima=${emotion}; final=${ending}; ~${messageCount} mensagens.

FÓRMULA VIRAL (siga à risca):
- GANCHO BRUTAL: a 1ª mensagem já joga uma bomba/segredo/acusação que dá vontade de saber o que vem. Nada de "oi tudo bem".
- ESCADA DE TENSÃO: cada mensagem aumenta a treta/curiosidade. Use mini-cliffhangers ("você não vai acreditar no que descobri", "senta que lá vem história").
- FALAS CURTAS e humanas: gíria brasileira real (tipo "mano", "pelo amor", "kkkk", "surtei", "para tudo"), erros propositais de digitação leves, áudios e prints citados. Alterne os 2 personagens.
- REVIRAVOLTA no final (${ending}) que reinterpreta tudo — a última mensagem tem que ser um soco.
- EMOÇÃO REAL: defina "emotion" CERTA pra CADA mensagem conforme o que ela sente (NUNCA deixe tudo "neutro"). Varie bastante: alegria, raiva, medo, surpresa, tristeza, ironia. Mensagens de choque = surpresa/medo; brigas = raiva; deboche = ironia.
- TÍTULO chamativo + "hook" de 1 linha com emoji + "caption" com pergunta que gera comentário + "part2_hook" que faz querer a parte 2 + 4-6 hashtags fortes.
- RITMO: "delay" entre 0.6 e 2.5s, somando ≈${duration}s; "time" HH:MM crescente e realista.

REGRAS DE SEGURANÇA: ficção/dramatização; sem pessoas/empresas reais; sem dados pessoais, golpes aplicáveis, instruções ilegais, conteúdo sexual explícito, ódio ou humilhação real.
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
