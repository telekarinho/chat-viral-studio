// Builds the Gemini prompt for viral fictional chat stories.

export const CATEGORIES = [
  'namoro', 'ciúmes', 'família', 'cliente maluco', 'chefe sem noção',
  'vizinho estranho', 'grupo da família', 'golpe engraçado', 'compra errada',
  'restaurante', 'entrega', 'escola', 'trabalho', 'casamento',
  'segredo revelado', 'caso absurdo', 'suspense leve', 'comédia',
];

const SCHEMA_HINT = `Responda APENAS com JSON válido (sem markdown, sem cercas de código), no formato:
{
  "title": "título viral curto e forte",
  "hook": "primeira frase de impacto (gancho), máx 60 caracteres",
  "characters": [
    { "id": "c1", "name": "Apelido", "side": "left", "online": true },
    { "id": "c2", "name": "Você", "side": "right", "online": true }
  ],
  "messages": [
    { "sender": "c1", "type": "text", "text": "fala curta e natural", "emotion": "neutro", "delay": 1.2, "time": "21:48", "status": "read" }
  ],
  "narration": "narração contínua e envolvente da história inteira, tom de quem conta um caso",
  "hashtags": ["#viral", "#fofoca"],
  "caption": "legenda curta para o post",
  "part2_hook": "frase que promete uma parte 2"
}`;

export function buildStoryPrompt(p = {}) {
  const {
    category = 'comédia',
    duration = 45,
    intensity = 'médio',     // leve | médio | absurdo
    emotion = 'engraçado',   // engraçado | suspense | drama leve | vergonha alheia
    ending = 'plot twist',   // engraçado | chocante | plot twist | continuação parte 2
    messageCount = 14,
  } = p;

  return `Você é um roteirista especialista em vídeos virais verticais (TikTok/Reels/Shorts).
Crie uma HISTÓRIA 100% FICTÍCIA em formato de conversa de aplicativo de mensagens.

REGRAS DE FICÇÃO E SEGURANÇA (obrigatórias):
- A história é ficção/dramatização para entretenimento. Não afirme ser real.
- NÃO use nomes de pessoas reais públicas. Use apelidos genéricos.
- NÃO inclua dados pessoais reais, golpes aplicáveis, instruções ilegais, conteúdo sexual explícito, ódio ou humilhação real.

PARÂMETROS:
- Categoria: ${category}
- Duração alvo: ${duration}s (ritmo das falas deve caber nesse tempo)
- Intensidade: ${intensity}
- Emoção dominante: ${emotion}
- Tipo de final: ${ending}
- Nº aproximado de mensagens: ${messageCount}

DIRETRIZES DE QUALIDADE:
- Comece com um gancho forte na primeira mensagem.
- Falas curtas, naturais, com gírias leves; alterne entre os 2 personagens.
- Aumente a tensão/curiosidade até o final ${ending}.
- "delay" é o tempo (s) antes de cada mensagem aparecer (0.6 a 2.5). Some os delays ≈ ${duration}s.
- "emotion" de cada mensagem ∈ [neutro, alegria, raiva, medo, surpresa, tristeza, ironia] (guia para a narração por voz).
- "time" em formato HH:MM, avançando de forma plausível.

${SCHEMA_HINT}`;
}

export function buildTextToChatPrompt(text, p = {}) {
  const { emotion = 'engraçado' } = p;
  return `Transforme o TEXTO abaixo numa conversa fictícia de aplicativo de mensagens entre 2 personagens.
Divida em mensagens curtas e naturais, alternando remetentes, adicionando pausas (delay) e horários.
Mantenha o sentido do texto. Trate como ficção/dramatização. Emoção dominante: ${emotion}.

TEXTO:
"""${text.slice(0, 4000)}"""

${SCHEMA_HINT}`;
}

export function buildViralScorePrompt(story) {
  return `Avalie este roteiro de vídeo viral. Responda APENAS JSON:
{ "hook": 0-100, "curiosity": 0-100, "retention": 0-100, "emotion": 0-100, "ending": 0-100, "part2": 0-100, "total": 0-100,
  "suggestions": ["título melhor: ...", "primeira frase melhor: ...", "corte: ...", "hashtags: ..."] }

ROTEIRO:
${JSON.stringify({ title: story.title, hook: story.hook, messages: story.messages?.slice(0, 30), part2_hook: story.part2_hook }).slice(0, 6000)}`;
}
