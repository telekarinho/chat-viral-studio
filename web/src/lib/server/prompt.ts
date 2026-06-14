// Server-side prompt builder (used by Next.js API routes — Vercel single-project mode).
export const CATEGORIES = [
  'namoro', 'ciúmes', 'família', 'cliente maluco', 'chefe sem noção',
  'vizinho estranho', 'grupo da família', 'golpe engraçado', 'compra errada',
  'restaurante', 'entrega', 'escola', 'trabalho', 'casamento',
  'segredo revelado', 'caso absurdo', 'suspense leve', 'comédia',
];

// Regras de conteúdo p/ NÃO perder monetização (TikTok, YouTube/Shorts, Reels/Instagram,
// Kwai, Facebook). O conteúdo precisa ser ORIGINAL e "advertiser-friendly".
export const PLATFORM_COMPLIANCE = `REGRAS DE MONETIZAÇÃO (OBRIGATÓRIAS — pra NÃO desmonetizar nem ser removido em TikTok/YouTube/Reels/Kwai/Facebook):
- CONTEÚDO ORIGINAL: roteiro 100% inédito; não copie falas/roteiros de terceiros; NÃO cite marcas, músicas, filmes, novelas ou PESSOAS REAIS (use nomes fictícios comuns).
- FICÇÃO CLARA: é dramatização/entretenimento; nada apresentado como fato real, notícia ou denúncia verdadeira.
- ADVERTISER-FRIENDLY: sem palavrão pesado (no máximo algo leve tipo "droga"); sem xingamento ofensivo. Pode ter treta e indignação, mas sem baixaria.
- PROIBIDO (derruba o vídeo / tira monetização): violência gráfica ou sangue, ameaça real, conteúdo sexual/nudez/insinuação explícita, assédio, discurso de ódio (raça, gênero, religião, orientação, deficiência), bullying real, automutilação/suicídio, uso ou venda de drogas, armas, golpe/fraude aplicável, desinformação (saúde/eleições), atividade ilegal ou perigosa imitável.
- SEM dados pessoais reais (telefone, CPF, endereço, placa, rosto identificável).
- O conflito vem da SITUAÇÃO ABSURDA + diálogo afiado (humor/indignação) — NUNCA da degradação real de uma pessoa.`;

const SCHEMA_HINT = `Responda APENAS com JSON válido (sem markdown), no formato:
{"title":"","hook":"","characters":[{"id":"c1","name":"","side":"left","gender":"f","online":true},{"id":"c2","name":"Você","side":"right","gender":"m","online":true}],
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
- "characters": defina "gender" ("f" ou "m") de CADA personagem conforme o contexto (quem é homem/mulher na história), INCLUSIVE o "Você" — isso escolhe a voz (feminina/masculina). Se houver 2 do mesmo gênero, mantenha o gênero certo (o app dá 2 vozes diferentes do mesmo gênero).
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

${PLATFORM_COMPLIANCE}
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
  // a locução tem que CABER na duração-alvo: ~2,5 palavras faladas por segundo
  const secs = Math.max(8, Math.min(150, Number(story.targetDuration) || 45));
  const words = Math.round(secs * 2.5);
  return `Você é um NARRADOR de fofocas de WhatsApp (TikTok/Reels), tipo um amigo contando uma treta no bar. Escreva a LOCUÇÃO FALADA (texto corrido, SEM tags, sem aspas) que conta ESTA conversa abaixo, reagindo a ela.
TAMANHO OBRIGATÓRIO: a locução INTEIRA deve durar ~${secs} segundos falados — ou seja, NO MÁXIMO ~${words} palavras no total (abertura + meio + fechamento). Seja conciso; corte o que não couber. Esse limite é mais importante que detalhar tudo.
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

// Continuação de uma história já criada (Parte N+1 de uma SÉRIE). Reaproveita os
// MESMOS personagens + o gancho "part2_hook" e escala o absurdo, sem repetir.
export function buildContinuationPrompt(prev: any = {}, p: any = {}) {
  const duration = Number(p.duration || prev.targetDuration || 45);
  const longo = (p.platform || 'curto') === 'longo';
  const part = Number(p.part || (Number(prev.part || 1) + 1));
  const chars = (prev.characters || []).map((c: any) => `${c.id}=${c.name} (${c.side}, ${c.gender || '?'})`).join(', ');
  const recap = (prev.messages || [])
    .filter((m: any) => m.type !== 'system')
    .slice(-16)
    .map((m: any) => {
      const who = (prev.characters || []).find((c: any) => c.id === m.sender)?.name || m.sender;
      return `${who}: ${m.type === 'text' ? m.text : '[' + m.type + (m.text ? ': ' + m.text : '') + ']'}`;
    })
    .join('\n');
  const platformRules = longo
    ? `DESTINO: YouTube/Facebook (LONGO). "narration" 500–1500 palavras com "salve" + inscreva-se; diálogo detalhado (${Math.max(p.messageCount || 16, 18)}+ mensagens).`
    : `DESTINO: TikTok/Reels/Shorts/Kwai (CURTO, até ~${duration}s). Ritmo acelerado; choca nos 3 primeiros segundos; "narration" no MÁXIMO ~${Math.round(duration * 2.5)} palavras.`;
  return `Aja como roteirista de SÉRIES de fofoca/treta narradas de WhatsApp. Escreva a PARTE ${part} (continuação direta) desta história 100% FICTÍCIA, mantendo OS MESMOS personagens e o fio da trama, ESCALANDO o absurdo (a parte nova tem que ser ainda mais chocante que a anterior).

HISTÓRIA ANTERIOR (Parte ${part - 1}):
- Título: ${prev.title || ''}
- Personagens (REUSE os mesmos ids e nomes): ${chars || 'c1=Contato (left), c2=Você (right)'}
- Como terminou (últimas mensagens):
${recap || '(sem histórico)'}
- Gancho deixado pra esta parte: ${prev.part2_hook || '(crie uma virada nova e coerente)'}

REGRAS DA CONTINUAÇÃO:
1. Os 3 primeiros segundos RELEMBRAM em 1 frase o que rolou e JÁ entregam novidade — quem não viu a Parte ${part - 1} entende; quem viu sente que evoluiu.
2. MANTENHA os mesmos personagens (mesmos ids c1/c2, nomes e o MESMO "gender" de cada um). Pode entrar 1 personagem novo só se intensificar o conflito.
3. Traga uma NOVA reviravolta (não repita a anterior) e termine com atitude drástica no app (sticker debochado e/ou system de bloqueio quando couber).
4. Deixe um NOVO "part2_hook" forte, emendando a PRÓXIMA parte — a série nunca "fecha de vez".
5. EMOÇÃO certa por mensagem (raiva/surpresa/ironia), prova visual (1 "type":"image") quando fizer sentido, e CTA pra comentar.
6. "title": curto e chamativo, SEM escrever "Parte X" (o app numera sozinho).
7. "narration": locução do narrador contando ESTA parte (cita o que os personagens disseram), no tom de fofoca ("Rapaz,", "Mano,"), fechando com "deixa tua opinião nos comentários…".

${platformRules}

${PLATFORM_COMPLIANCE}
${SCHEMA_HINT}`;
}

export function buildTextToChatPrompt(text: string, p: any = {}) {
  const { emotion = 'engraçado' } = p;
  return `Transforme o TEXTO numa conversa fictícia de app de mensagens entre 2 personagens. Mensagens curtas alternando remetentes, com pausas (delay) e horários. Emoção dominante: ${emotion}. Trate como ficção.
TEXTO: """${(text || '').slice(0, 4000)}"""
${PLATFORM_COMPLIANCE}
${SCHEMA_HINT}`;
}

// ── TikTok Shop ───────────────────────────────────────────────────────────
// Regras específicas de Shop/afiliado pra vender SEM quebrar política (e sem
// derrubar a conta): honestidade, sem promessa milagrosa, disclosure de publi.
export const SHOP_COMPLIANCE = `REGRAS DO TIKTOK SHOP / AFILIADO (OBRIGATÓRIAS — pra vender sem ser banido/desmonetizado):
- HONESTIDADE: descreva só benefícios REAIS e plausíveis do produto. PROIBIDO promessa milagrosa, "cura", "100% garantido", resultado garantido, antes/depois médico, emagrecimento milagroso, enriquecimento rápido.
- SEM categoria proibida (remédio/suplemento com alegação de saúde, arma, conteúdo adulto, falsificado, dinheiro/serviço financeiro duvidoso).
- PUBLICIDADE TRANSPARENTE: se for afiliado/parceria, INCLUA aviso claro em "disclosure" e no texto (#publi / "parceria paga" / "ganho comissão"). Se for loja própria, deixe claro que é seu produto.
- SEM dado falso, sem urgência mentirosa ("só hoje" só se for verdade), sem depoimento inventado de pessoa real.
- CTA leva pra "cestinha"/link do produto de forma natural; nada de pedir pra "sair do app".`;

// Roteiro UGC/review pra creator gravar (gancho → dor → produto → prova → CTA).
export function buildShopScriptPrompt(input: any = {}) {
  const { product = '', benefits = '', offer = '', audience = '', role = 'afiliado', duration = 30 } = input;
  const isAff = role === 'afiliado' || role === 'ambos';
  return `Você é um roteirista de UGC (vídeos que VENDEM) pra TikTok Shop. Escreva um roteiro CURTO de ~${duration}s, em PT-BR, de um creator falando na câmera, no estilo "descobri isso e mudou tudo", altamente persuasivo e ORIGINAL.

PRODUTO: ${product}
BENEFÍCIOS/DOR QUE RESOLVE: ${benefits}
${offer ? `OFERTA/PREÇO: ${offer}` : ''}
${audience ? `PÚBLICO: ${audience}` : ''}
PAPEL: ${isAff ? 'AFILIADO (precisa de aviso de publicidade)' : 'VENDEDOR (loja própria)'}

ESTRUTURA (cada campo é uma fala curta, natural, com gírias leves):
- "hook": 0–3s que PRENDE mostrando a dor ou o resultado ("Para de gastar dinheiro à toa com…", "Se você sofre com X, presta atenção").
- "problem": a dor/frustração que o público sente.
- "solution": o produto entrando como solução, de forma natural.
- "proof": demonstração/benefício concreto (sem promessa falsa).
- "cta": chamada pra comprar pela cestinha/link ("toca na cestinha amarela", "link no perfil").
- "onScreenText": 3 a 5 textos curtos pra colar na tela (legendas de impacto).
- "caption": legenda do post com CTA.
- "hashtags": 4–6 (#tiktokshop #achadinhos + nicho).
- "disclosure": ${isAff ? 'aviso de publicidade/parceria obrigatório (ex: "Publi • ganho comissão por compras pelo meu link").' : 'aviso curto de que é produto da sua loja.'}

${SHOP_COMPLIANCE}
Responda APENAS JSON: {"hook":"","problem":"","solution":"","proof":"","cta":"","onScreenText":["",""],"caption":"","hashtags":["#tiktokshop"],"disclosure":""}`;
}

// Versão "chat shoppable": uma conversa fictícia onde o produto resolve um problema
// de forma engraçada/viral e termina com CTA — reaproveita o motor de vídeo.
export function buildShopChatPrompt(input: any = {}) {
  const { product = '', benefits = '', offer = '', role = 'afiliado', duration = 30, messageCount = 12 } = input;
  const isAff = role === 'afiliado' || role === 'ambos';
  return `Crie uma conversa fictícia de WhatsApp (PT-BR) que VENDE um produto do TikTok Shop de forma natural e viral, em ~${duration}s (~${messageCount} mensagens). Um amigo conta pro outro como o produto resolveu o problema dele — leve, engraçado, com prova, terminando em CTA pra cestinha/link.

PRODUTO: ${product}
BENEFÍCIOS/DOR: ${benefits}
${offer ? `OFERTA: ${offer}` : ''}
PAPEL: ${isAff ? 'AFILIADO (mencione naturalmente que ganha comissão / é parceria)' : 'VENDEDOR (loja própria)'}

REGRAS:
- c1 = amigo que indica (left), c2 = "Você" curioso (right). Alterne, falas curtas, emoção certa por mensagem.
- 1 mensagem "type":"image" mostrando o produto/resultado (no "text" descreva a foto).
- Termine com "caption" e um "part2_hook" puxando "review completo na parte 2".
- "narration": locução curta vendendo o produto e fechando com CTA pra cestinha.
- "hashtags" com #tiktokshop.
${SHOP_COMPLIANCE}
${PLATFORM_COMPLIANCE}
${SCHEMA_HINT}`;
}

export function buildViralScorePrompt(story: any) {
  return `Avalie este roteiro viral. Responda APENAS JSON:
{"hook":0-100,"curiosity":0-100,"retention":0-100,"emotion":0-100,"ending":0-100,"part2":0-100,"total":0-100,"suggestions":["..."]}
ROTEIRO: ${JSON.stringify({ title: story?.title, hook: story?.hook, messages: story?.messages?.slice(0, 30), part2_hook: story?.part2_hook }).slice(0, 6000)}`;
}
