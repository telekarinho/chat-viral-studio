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
  const { category = 'comédia', duration = 40, intensity = 'médio', emotion = 'engraçado', ending = 'plot twist', messageCount = 14, platform = 'curto' } = p;
  const longo = platform === 'longo';
  const platformRules = longo
    ? `DESTINO: YouTube/Facebook (vídeo LONGO/narrativo). Ritmo de construção, com suspense e pausas dramáticas.
- "narration": 500–1500 palavras, começa com o "salve" clássico de canal ("Salve meus queridos! Antes de começar, já deixa o like e se inscreve no canal…") e SÓ DEPOIS apresenta o absurdo.
- Diálogo mais longo e detalhado (use ${Math.max(messageCount, 18)}+ mensagens).
- CTA final: inscrição, compartilhamento e "fica até o fim" ("Se inscreve no canal pra não perder a parte 2 e compartilha com aquele amigo que precisa ver isso!").`
    : `DESTINO: TikTok/Reels/Shorts/Kwai (vídeo CURTO). Ritmo EXTREMAMENTE acelerado, sem enrolação.
- "narration": no MÁXIMO 130–150 palavras (cabe em ~60s). Corta apresentação longa.
- Os 3 primeiros segundos têm que CHOCAR.
- CTA final rápido de rede ("Clica no + e deixa sua opinião", "Segue pra parte 2", "Curte e comenta 👇").`;
  return `Aja como roteirista ESPECIALISTA em RETENÇÃO de público para histórias/fofocas narradas de WhatsApp. Crie um roteiro 100% FICTÍCIO que prenda do início ao fim usando INDIGNAÇÃO, FOFOCA ou CHOQUE.

PARÂMETROS: categoria base=${category}; duração≈${duration}s; intensidade=${intensity}; ~${messageCount} mensagens; final=${ending}.

${platformRules}

ESCOLHA UM TEMA (o que mais viraliza):
1) Traição com reviravolta extrema (a vítima se vinga de forma absurda).
2) Patrão tóxico exigindo trabalho não pago / metas impossíveis.
3) Pessoas sem noção (vizinho/parente fazendo pedido íntimo ou absurdo).

ESTRUTURA OBRIGATÓRIA (4 passos):
1. GANCHO NARRADO (0–5s): narrador com tom de fofoca/indignação apresenta o VILÃO. Ex: "Rapaz, pensa numa...", "Mano, eu já vi de tudo, mas...", "Veja só a coragem dessa pessoa...".
2. DESENVOLVIMENTO (diálogo rápido no chat): o VILÃO age com naturalidade diante do absurdo; a VÍTIMA começa sensata e vai perdendo a paciência. Falas curtas, alternando os 2.
3. CLÍMAX / PLOT TWIST: explosão — a vítima dá uma invertida chocante / revela segredo destrutivo, OU o vilão faz a exigência final que passa de todos os limites.
4. REAÇÃO DO NARRADOR + CTA: o narrador reage ao absurdo e joga pros comentários. Ex: "Mano, tu já pensou? Quem tá certo? Deixa tua opinião aí que eu quero saber!".

TOM: informal, como quem conta fofoca no bar. Use "Mano", "Rapaz", "Tu já pensou?", "Cara". Gíria BR real, erros leves de digitação.

EXEMPLOS DA LÓGICA E DO TOM (siga este padrão, NÃO copie):
— Traição: (Narrador) "Rapaz, pensa numa namorada que achou que tava por cima e tomou a pior invertida da história!" (Chat) Vilã: "tô te traindo com seu irmão, ele é mais alto e mais rico 😏" → Vítima: "relaxa. eu e ele apostamos quem pegava mais gente essa semana kkkk" → (clímax) Vítima: "missão nova: vou ficar com a sua família toda. manda um abraço pra sua mãe 😈" → (Narrador/CTA) "Mano, o cara transformou o chifre em campeonato! Ele foi longe demais ou ela mereceu? Comenta aí!".
— Patroa tóxica: (Narrador) "Mano, eu já vi chefe abusada, mas igual a dona Luciana não existe!" (Chat) Patroa: "você abriu 7h04, foram 4 min de atraso, não se repita." → Funcionária: "ok, mas já saí 18h30 sem você reclamar 🙄" → (clímax) Patroa: "amanhã chega 5h30 e arruma o coquetel sozinha, eu e minha filha vamos no salão. você é paga pra isso!" → (CTA) "Rapaz, tu queria uma dona Luciana na tua vida? Deixa tua opinião!".
— Vizinha sem noção: (Narrador) "Cara, vizinha intrometida tem de monte, mas essa passou de todos os limites!" (Chat) Vizinha: "pergunta pro seu namorado quanto ele cobra pra fazer uma tattoo bem pequenininha 🙃" → Namorada: "claro, onde você quer?" → (clímax) Vizinha: "perto da virilha, mas tem que ser com ele que eu confio 😅" → Namorada: "ele NÃO vai fazer." → (CTA) "Mano, se teu namorado fosse tatuador, tu deixaria? Comenta!".

MAPEAMENTO PRO JSON:
- "hook": o gancho narrado do passo 1 (1 linha, tom de narrador, com emoji).
- "messages": só o DIÁLOGO do chat (passos 2 e 3), alternando vilão (c1, side left) e vítima (c2, side right). EMOÇÃO certa por mensagem (NUNCA tudo "neutro"): raiva nas brigas, surpresa/medo no choque, ironia no deboche. Termine com a vítima invertendo/bloqueando.
- "narration": o roteiro COMPLETO do narrador (gancho + reação final + CTA), em tom de fofoca de bar.
- "caption": SEMPRE com CTA pra comentar ("E aí, o que VOCÊ faria? Comenta 👇").
- "title" chamativo; "part2_hook" que faz querer a parte 2; 4–6 hashtags fortes (#fofoca #treta #viral #fy).
- "delay" 0.6–2.5s somando ≈${duration}s; "time" HH:MM crescente.

REGRAS DE SEGURANÇA: ficção/dramatização; sem pessoas/empresas reais; sem dados pessoais, golpes aplicáveis, instruções ilegais, conteúdo sexual explícito, ódio ou humilhação real (mantenha o tom de fofoca/comédia, sem apelar).
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
