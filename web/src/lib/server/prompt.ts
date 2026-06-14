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
- "narration": é a LOCUÇÃO falada do narrador — ele CONTA ESTA MESMA história (a mesma de "messages"), reagindo. NÃO pode ser genérica: tem que citar o que os personagens disseram. Estrutura OBRIGATÓRIA, texto corrido (sem tags), em 1ª pessoa de fofoqueiro:
  (1) ABRE com: "Rapaz, pensa num(a) [adjetivo + pessoa]. Veja só essa história!" (ou "Mano,...").
  (2) NARRA a conversa em ordem, relatando o que cada um mandou COM as próprias palavras do narrador e reagindo ("aí a patroa mandou que queria ela às 5 da manhã, óh…").
  (3) NO MEIO, INTERROMPE pelo menos 1x indignado/sarcástico: "Mano, olha a audácia…", "Rapaz, eu não tô acreditando nisso…", "Tu já pensou um negócio desse?".
  (4) FECHA SEMPRE com: "E aí pessoal, deixa a tua opinião nos comentários. Quem tá certo? O que tu faria numa situação dessa? Deixa aí que eu quero saber!".
  Importante: a narração e as "messages" contam a MESMA história — se a conversa fala de patroa folgada, a narração é sobre a patroa folgada.
- "caption": SEMPRE com CTA pra comentar ("E aí, o que VOCÊ faria? Comenta 👇").
- "title" chamativo; "part2_hook" que faz querer a parte 2; 4–6 hashtags fortes (#fofoca #treta #viral #fy).
- "delay" 0.6–2.5s somando ≈${duration}s; "time" HH:MM crescente.

REGRAS DE OURO PARA VIRALIZAR (use TODAS quando couber):
1. PROVA VISUAL: inclua 1 mensagem com "type":"image" no meio da conversa (a foto comprometedora/chocante) — no "text" descreva a foto (ex: "foto do vestido", "print da conversa com o outro", "foto da chave PIX"). Isso faz o público pausar pra olhar.
2. INTERRUPÇÃO DO NARRADOR: na "narration", o narrador PARA a leitura pelo menos 1x no meio pra soltar um comentário sarcástico/indignado ("Rapaz, olha a hora que essa mulher tá acordando…") antes de revelar o final.
3. POLARIZAÇÃO (quando for discussão/casal): deixe os DOIS com um pouco de razão (ambos teimosos) e termine o CTA perguntando "Quem que TU acha que tá certo? Ele ou ela? Comenta!" — isso faz homens e mulheres brigarem nos comentários.
4. CLÍMAX COM AÇÃO: termine com atitude drástica no app — uma "type":"sticker" debochada (ex: 🤡 👋 💅) E/OU uma "type":"system" tipo "Você bloqueou [Nome]" ou "[Nome] saiu da conversa". Bloqueio/resposta seca no fim.
5. CONTRASTE FOFO (opcional, p/ compartilhamento): se o tema pedir, faça uma história de atitude ELOGIÁVEL (ex: padrasto que acolhe a enteada) — o narrador elogia muito no fim e pede "marca aquele parceiro(a) gente boa".

TIPOS de mensagem disponíveis em "type": "text" | "image" (foto) | "sticker" (figurinha, use emoji no text) | "audio" | "system" (aviso central, ex: bloqueio) | "deleted" | "call_missed".

REGRAS DE SEGURANÇA: ficção/dramatização; sem pessoas/empresas reais; sem dados pessoais, golpes aplicáveis, instruções ilegais, conteúdo sexual explícito, ódio ou humilhação real (mantenha o tom de fofoca/comédia, sem apelar).
${SCHEMA_HINT}`;
}

// Gera SÓ a locução do narrador a partir das mensagens já existentes (garante que
// a narração combine com a conversa, mesmo depois de editar).
export function buildNarrationPrompt(story: any = {}) {
  const chars = (story.characters || []).reduce((m: any, c: any) => { m[c.id] = c.name; return m; }, {});
  // serializa cada tipo entre colchetes; a legenda da foto é DIREÇÃO de cena
  // (não é fala) — entra como anotação pro narrador mencionar, nunca ler literal.
  const line = (m: any) => {
    const who = chars[m.sender] || m.sender;
    switch (m.type) {
      case 'image': return `${who}: [enviou uma foto mostrando: ${m.text}]`;
      case 'audio': return `${who}: [enviou um áudio]`;
      case 'sticker': return `${who}: [enviou uma figurinha]`;
      case 'deleted': return `${who}: [apagou uma mensagem]`;
      case 'call_missed': return `${who}: [chamada perdida]`;
      default: return `${who}: ${m.text}`;
    }
  };
  const convo = (story.messages || []).filter((m: any) => m.type !== 'system').map(line).join('\n');
  return `Você é um NARRADOR de fofocas de WhatsApp (TikTok/Reels), tipo um amigo contando uma treta no bar. Escreva a LOCUÇÃO FALADA (texto corrido, SEM tags, sem aspas) que conta ESTA conversa abaixo, reagindo a ela.
ESTRUTURA OBRIGATÓRIA:
1) ABRE com "Rapaz, pensa num(a) [adjetivo+pessoa]. Veja só essa história!" (ou "Mano,...").
2) CONTA a conversa na ordem, relatando com as próprias palavras o que cada um mandou + reagindo.
3) NO MEIO, interrompe pelo menos 1x indignado/sarcástico: "Mano, olha a audácia…", "Rapaz, eu não tô acreditando…", "Tu já pensou um negócio desse?".
4) FECHA SEMPRE com: "E aí pessoal, deixa a tua opinião nos comentários. Quem tá certo? O que tu faria numa situação dessa? Deixa aí que eu quero saber!".
Gírias: mano, rapaz, tu já pensou, cara.
REGRA CRÍTICA: o que está entre colchetes [ ] é DIREÇÃO DE CENA, NÃO é fala — NUNCA leia/transcreva literalmente. Ex.: "[enviou uma foto mostrando: foto de um desodorante]" → diga naturalmente algo como "aí ela mandou a foto do desodorante", JAMAIS "foto de um desodorante masculino específico da marca". Não fale "abre colchete", "enviou uma foto mostrando", nem repita a legenda crua.
Responda APENAS JSON: {"narration":"...texto da locução..."}.
CONVERSA:
${convo.slice(0, 4000)}`;
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
