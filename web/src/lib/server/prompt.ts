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

TEMA = CONFLITO QUE GERA REVOLTA (o que mais viraliza e enche de comentário). Escolha um ângulo forte dentro de "${category}":
- Traição descoberta de forma absurda + cara de pau (a pessoa pega no flagra ainda tenta justificar).
- Patrão/cliente folgado exigindo o impossível (hora extra não paga, pedido absurdo, abuso de autoridade).
- Parceiro(a)/parente tóxico ou folgado (exige dinheiro, controla roupa, pedido sem noção) x uma VÍTIMA SENSATA.
Sempre: um VILÃO folgado/audacioso/hipócrita VS uma vítima sensata que no fim dá a resposta atravessada e BLOQUEIA.

FÓRMULA VIRAL (siga à risca):
- GANCHO BRUTAL (1ª msg): já joga a bomba/acusação. Nada de "oi tudo bem".
- ESCADA DE TENSÃO: cada msg aumenta o absurdo do folgado. Use mini-cliffhanger ("você não vai acreditar", "senta que lá vem").
- FALAS CURTAS e humanas: gíria BR real ("mano", "rapaz", "pelo amor", "kkkk", "surtei", "tu já pensou?"), erros leves de digitação. Alterne os 2 personagens.
- CLÍMAX/PLOT TWIST (${ending}): o folgado faz o pedido final absurdo e a vítima responde atravessado e BLOQUEIA ("sendo assim, cancelo o jantar e você da minha vida. Bloqueado.").
- EMOÇÃO REAL por mensagem (NUNCA tudo "neutro"): raiva nas brigas, surpresa no choque, ironia no deboche, medo no susto, alegria/tristeza quando couber.
- "title" chamativo; "hook" de 1 linha em tom de NARRADOR indignado com emoji ("Rapaz, olha a coragem dessa patroa 😱"); "caption" SEMPRE com CHAMADA PRA COMENTAR ("E aí, o que VOCÊ faria? Comenta 👇"); "part2_hook" que faz querer a parte 2; 4-6 hashtags fortes (#fofoca #treta #viral #fy).
- "narration": texto do narrador conversando com o público (gírias "mano/rapaz"), com a reação indignada no fim + CTA pra comentários.
- RITMO: "delay" 0.6–2.5s somando ≈${duration}s; "time" HH:MM crescente.

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
