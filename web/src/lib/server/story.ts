// Server-side story normalizer + offline mock (Next.js API routes).
function uid() { return Math.random().toString(36).slice(2, 10); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

export function normalizeStory(raw: any = {}, params: any = {}): any {
  const characters = (raw.characters?.length ? raw.characters : [
    { id: 'c1', name: 'Contato', side: 'left', online: true },
    { id: 'c2', name: 'Você', side: 'right', online: true },
  ]).map((c: any, i: number) => ({
    id: c.id || `c${i + 1}`,
    name: c.name || (i === 0 ? 'Contato' : 'Você'),
    side: c.side || (i === 0 ? 'left' : 'right'),
    online: c.online ?? true,
    avatarColor: c.avatarColor || ['#25D366', '#34B7F1', '#FF7A59', '#A78BFA'][i % 4],
    // gênero define a voz (f/m). A IA preenche pelo contexto; senão fica indefinido
    // e o cliente (audio.ts) infere pelo nome.
    gender: c.gender === 'f' || c.gender === 'm' ? c.gender : undefined,
  }));
  const ids = new Set(characters.map((c: any) => c.id));

  let clock = 21 * 60 + 47;
  const messages = (raw.messages || []).map((m: any, i: number) => {
    clock += Math.round((m.delay || 1.2) / 1.5);
    const hh = String(Math.floor(clock / 60) % 24).padStart(2, '0');
    const mm = String(clock % 60).padStart(2, '0');
    const sender = ids.has(m.sender) ? m.sender : characters[i % characters.length].id;
    return {
      id: m.id || `m${i + 1}`,
      sender, type: m.type || 'text', text: m.text || '',
      emotion: m.emotion || 'neutro',
      delay: clamp(Number(m.delay) || 1.2, 0.4, 4),
      time: m.time || `${hh}:${mm}`,
      status: m.status || 'read',
      audioUrl: m.audioUrl || null,
    };
  });

  return {
    id: raw.id || uid(),
    title: raw.title || 'História sem título',
    hook: raw.hook || '',
    category: params.category || raw.category || 'comédia',
    theme: raw.theme || 'verde',
    characters, messages,
    narration: raw.narration || '',
    hashtags: raw.hashtags?.length ? raw.hashtags : ['#viral', '#historia', '#fy'],
    caption: raw.caption || '',
    part2_hook: raw.part2_hook || '',
    fictionSeal: true,
    viralScore: raw.viralScore || null,
    // duração-alvo (s) escolhida no Criar — guia o tamanho da narração e do vídeo
    targetDuration: Number(params.duration || raw.targetDuration || 45) || 45,
  };
}

const BANK: Record<string, [string, string][]> = {
  namoro: [
    ['c1', 'amor, vc tá acordado?'], ['c2', 'tô sim, aconteceu algo?'],
    ['c1', 'preciso te contar uma coisa…'], ['c2', 'me assustou agora 😳'],
    ['c1', 'lembra do meu "primo"?'], ['c2', 'lembro… o que tem ele'],
    ['c1', 'então… ele não é meu primo'], ['c2', 'COMO ASSIM não é teu primo'],
    ['c1', 'ele é meu chefe. menti pra te testar'], ['c2', 'testar o quê???'],
    ['c1', 'pra ver se vc tinha ciúmes'], ['c2', 'e ele topou nessa palhaçada?'],
    ['c1', 'topou. e adivinha quem tá lendo isso'], ['c2', 'não brinca…'],
    ['c1', 'oi, sou o chefe dela 😅 ela esqueceu o cel aberto'],
  ],
  'cliente maluco': [
    ['c1', 'oi, o pedido chegou todo errado'], ['c2', 'oi! o que veio diferente?'],
    ['c1', 'eu pedi pizza e veio… pizza'], ['c2', 'e qual o problema? 😅'],
    ['c1', 'eu QUERIA que viesse errado pra ganhar grátis'], ['c2', 'senhor, não funciona assim'],
    ['c1', 'então deixa errado de propósito'], ['c2', 'não posso fazer isso'],
    ['c1', 'vou avaliar com 1 estrela'], ['c2', 'a pizza tá certa…'],
    ['c1', 'por isso mesmo. tá certa DEMAIS'], ['c2', '???'],
    ['c1', 'esquece. manda outra. errada'], ['c2', 'vou encerrar o atendimento 🙏'],
  ],
};

export function mockStory(params: any = {}): any {
  const { category = 'namoro' } = params;
  const lines = BANK[category] || BANK.namoro;
  const messages = lines.map(([sender, text], i) => ({
    sender, type: 'text', text,
    emotion: i === lines.length - 1 ? 'surpresa' : i % 3 === 0 ? 'ironia' : 'neutro',
    delay: 0.8 + (i % 3) * 0.5, status: 'read',
  }));
  return normalizeStory({
    title: category === 'cliente maluco' ? 'O cliente que QUERIA errar' : 'Ela mentiu pra me testar',
    hook: category === 'cliente maluco' ? 'Esse cliente queria o pedido ERRADO 😳' : 'Ela esqueceu o celular aberto…',
    characters: [
      { id: 'c1', name: category === 'cliente maluco' ? 'Cliente' : 'Bem 💚', side: 'left', gender: category === 'cliente maluco' ? 'm' : 'f' },
      { id: 'c2', name: 'Você', side: 'right', gender: category === 'cliente maluco' ? 'f' : 'm' },
    ],
    messages,
    narration: 'Essa conversa começou tranquila… mas o final ninguém esperava. Presta atenção até o fim porque a última mensagem muda tudo.',
    hashtags: ['#fofoca', '#namoro', '#viral', '#parte2'],
    caption: 'Você ficaria bravo? 👀 #ficção',
    part2_hook: 'A reação dele na parte 2 foi PIOR…',
    viralScore: { hook: 84, curiosity: 80, retention: 74, emotion: 88, ending: 90, part2: 78, total: 82, suggestions: [] },
  }, params);
}

// Tira o prefixo "Parte N — " do título pra achar o título-base da série.
export function seriesBaseTitle(title = ''): string {
  return (title || '').replace(/^\s*parte\s*\d+\s*[—\-:]\s*/i, '').trim();
}

// Continuação local (fallback sem IA): reaproveita os personagens da parte anterior
// e o gancho part2_hook, montando uma Parte N coerente e escalada.
export function mockContinuation(prev: any = {}, params: any = {}): any {
  const characters = (prev.characters?.length ? prev.characters : [
    { id: 'c1', name: 'Contato', side: 'left' },
    { id: 'c2', name: 'Você', side: 'right' },
  ]);
  const v = characters[0]?.name || 'ele';
  const hook = (prev.part2_hook || '').trim() || `A treta com ${v} continuou… e ficou pior 👀`;
  const messages = [
    { sender: 'c1', type: 'text', text: 'oi… sobre tudo aquilo de ontem', emotion: 'neutro', delay: 1, status: 'read' },
    { sender: 'c2', type: 'text', text: 'eu ainda nem processei o que você fez', emotion: 'raiva', delay: 1.2, status: 'read' },
    { sender: 'c1', type: 'text', text: 'calma que tem MAIS coisa que você não sabe', emotion: 'surpresa', delay: 1.3, status: 'read' },
    { sender: 'c2', type: 'text', text: 'COMO ASSIM mais coisa???', emotion: 'surpresa', delay: 1, status: 'read' },
    { sender: 'c1', type: 'image', text: 'print que prova tudo', emotion: 'medo', delay: 1.5, status: 'read' },
    { sender: 'c2', type: 'text', text: 'pronto. agora você explica isso pra todo mundo 💅', emotion: 'ironia', delay: 1.2, status: 'read' },
    { sender: 'c2', type: 'system', text: `Você bloqueou ${v}.`, emotion: 'neutro', delay: 1, status: 'read' },
  ];
  return normalizeStory({
    title: seriesBaseTitle(prev.title) || prev.title || 'A continuação',
    hook,
    characters,
    narration: '',
    messages,
    hashtags: prev.hashtags?.length ? prev.hashtags : ['#parte2', '#fofoca', '#viral', '#fy'],
    caption: 'A parte 2 chegou 👀 E aí, o que VOCÊ faria? Comenta #ficção',
    part2_hook: 'E na parte 3? Ninguém esperava esse plot…',
  }, { ...params, category: prev.category, duration: params.duration || prev.targetDuration });
}

// Roteiro UGC local (fallback sem IA) pra TikTok Shop.
export function mockShopScript(input: any = {}): any {
  const p = (input.product || 'esse produto').trim();
  const b = (input.benefits || 'resolve aquele problema chato do dia a dia').trim();
  const isAff = input.role === 'afiliado' || input.role === 'ambos';
  return {
    hook: `Para de perder tempo e dinheiro — ${p} mudou minha rotina 👀`,
    problem: `Sabe aquela dor de cabeça com isso? ${b}.`,
    solution: `Aí eu testei ${p} e simplesmente resolveu.`,
    proof: `Olha como é fácil de usar — sem complicação, no dia a dia.`,
    cta: `Toca na cestinha amarela aqui embaixo e garante o seu 🛒`,
    onScreenText: [`${p} 😮`, 'testei por você', 'antes x depois', 'tá na cestinha 👇'],
    caption: `${p} virou meu queridinho 😍 corre que tá com oferta! #tiktokshop`,
    hashtags: ['#tiktokshop', '#achadinhos', '#achados', '#tiktokmefezcomprar', '#viral'],
    disclosure: isAff ? 'Publi • ganho uma comissão por compras feitas pelo meu link/cestinha.' : 'Produto da minha loja.',
  };
}

// "Chat shoppable" local (fallback sem IA): conversa que vende o produto.
export function mockShopChat(input: any = {}): any {
  const p = (input.product || 'aquele produto').trim();
  const isAff = input.role === 'afiliado' || input.role === 'ambos';
  const messages = [
    { sender: 'c1', type: 'text', text: `amiga, descobri ${p} e não consigo mais viver sem`, emotion: 'alegria', delay: 1, status: 'read' },
    { sender: 'c2', type: 'text', text: 'serio? eu tava louca atrás de algo assim', emotion: 'surpresa', delay: 1.1, status: 'read' },
    { sender: 'c1', type: 'text', text: 'mudou minha rotina, juro', emotion: 'alegria', delay: 1, status: 'read' },
    { sender: 'c1', type: 'image', text: `foto do ${p} em uso`, emotion: 'neutro', delay: 1.4, status: 'read' },
    { sender: 'c2', type: 'text', text: 'caramba que prático 😍 onde compra?', emotion: 'surpresa', delay: 1.1, status: 'read' },
    { sender: 'c1', type: 'text', text: isAff ? 'tá na cestinha do meu perfil (ganho uma comissãozinha 🙈)' : 'tá na cestinha da minha lojinha 🛒', emotion: 'alegria', delay: 1.2, status: 'read' },
  ];
  return normalizeStory({
    title: `${p} — o achadinho que todo mundo quer`,
    hook: `Esse achadinho tá viralizando 👀`,
    characters: [
      { id: 'c1', name: 'Amiga 💕', side: 'left', gender: 'f' },
      { id: 'c2', name: 'Você', side: 'right', gender: 'f' },
    ],
    messages,
    narration: '',
    hashtags: ['#tiktokshop', '#achadinhos', '#viral', '#fy'],
    caption: 'Corre que tá na cestinha 🛒 #tiktokshop',
    part2_hook: 'Na parte 2 eu mostro o review completo…',
  }, { ...input, category: 'compra errada' });
}

export function textToChatLocal(text: string, params: any = {}): any {
  const chunks = (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .flatMap((s) => (s.length > 90 ? s.match(/.{1,90}(\s|$)/g) || [s] : [s]))
    .map((s) => s.trim()).filter(Boolean);
  const messages = chunks.map((t, i) => ({
    sender: i % 2 === 0 ? 'c1' : 'c2', type: 'text', text: t,
    emotion: 'neutro', delay: 0.8 + Math.min(t.length / 60, 1.6), status: 'read',
  }));
  return normalizeStory({
    title: chunks[0]?.slice(0, 40) || 'Minha história',
    hook: chunks[0]?.slice(0, 60) || '',
    characters: [{ id: 'c1', name: 'Pessoa 1', side: 'left' }, { id: 'c2', name: 'Pessoa 2', side: 'right' }],
    messages, narration: text,
    hashtags: ['#historia', '#viral', '#ficção'],
    caption: 'História fictícia para entretenimento.',
    part2_hook: 'Quer a parte 2?',
  }, params);
}

// Locução do narrador montada localmente (fallback sem IA), a partir das mensagens.
export function buildNarrationLocal(story: any = {}): string {
  const chars = (story.characters || []).reduce((m: any, c: any) => { m[c.id] = c.name; return m; }, {});
  const msgs = (story.messages || []).filter((m: any) => m.type !== 'system');
  const open = story.hook?.trim()
    ? story.hook.trim()
    : 'Rapaz, pensa numa situação dessas. Veja só essa história!';
  // legenda da foto é DIREÇÃO de cena ("Foto de um desodorante…") — nunca lê
  // literal. Limpa o prefixo pra virar uma menção natural.
  const photoDesc = (t: string) => {
    const d = (t || '').replace(/\s+/g, ' ').trim()
      .replace(/^(uma?\s+)?(foto|print|imagem|captura(\s+de\s+tela)?|screenshot|selfie|figura)\s*(d[aoe]s?|de|com|mostrando|que mostra)?\s*/i, '')
      .replace(/^(da|do|de|dos|das)\s+/i, '').trim();
    return d ? ` de ${d}` : '';
  };
  const body = msgs.map((m: any, i: number) => {
    const who = chars[m.sender] || 'a pessoa';
    let what: string;
    switch (m.type) {
      case 'image': what = `mandou uma foto${photoDesc(m.text)}`; break;
      case 'audio': what = 'mandou um áudio'; break;
      case 'sticker': what = 'mandou uma figurinha'; break;
      case 'deleted': what = 'apagou uma mensagem'; break;
      case 'call_missed': what = 'tentou ligar'; break;
      default: what = `mandou: ${m.text}`;
    }
    const mid = i === Math.floor(msgs.length / 2) ? 'Mano, olha a audácia… tu já pensou um negócio desse? ' : '';
    return `${mid}Aí ${who} ${what}`;
  }).join('. ');
  const cta = 'E aí pessoal, deixa a tua opinião nos comentários. Quem tá certo? O que tu faria numa situação dessa? Deixa aí que eu quero saber!';
  // cabe na duração-alvo (~2,5 palavras/s): trunca o corpo mantendo abertura + CTA
  const secs = Math.max(8, Math.min(150, Number(story.targetDuration) || 45));
  const budget = Math.max(12, Math.round(secs * 2.5) - open.split(/\s+/).length - cta.split(/\s+/).length);
  const bodyWords = body.split(/\s+/);
  const trimmedBody = bodyWords.length > budget ? bodyWords.slice(0, budget).join(' ') + '…' : body;
  return `${open}. ${trimmedBody}. ${cta}`;
}

export function heuristicScore(story: any = {}): any {
  const msgs = story.messages || [];
  const hookText = String(story.hook || '');
  const allText = (msgs.map((m: any) => m.text).join(' ') + ' ' + hookText + ' ' + (story.caption || '') + ' ' + (story.part2_hook || '')).toLowerCase();

  // sinais de viralização (conflito, treta, reviravolta) — o que o público comenta
  const shock = /(trai|flagra|descobri|pega no|bloquei|absurd|sem no[çc]|folgad|t[óo]xic|chocant|surtei|cara de pau|exigiu|exige|demit|me deu um perd|acabou tudo|nem acredit|coragem de)/.test(allText);
  const cliff = /(você não vai acreditar|vc n[ãa]o vai acreditar|adivinha|senta que|presta aten|espera o final|olha isso|veja s[óo]|pera|\?\?\?)/.test(allText);
  const cta = /(comenta|coment[áa]rios|o que (você|vc|tu) faria|deixa (sua|tua) opini|e a[íi] (pessoal|galera)|concorda)/.test(allText);

  const distinctEmo = new Set(msgs.map((m: any) => m.emotion).filter((e: string) => e && e !== 'neutro')).size;
  const nonNeutro = msgs.length ? msgs.filter((m: any) => m.emotion && m.emotion !== 'neutro').length / msgs.length : 0;
  const avgLen = msgs.length ? msgs.reduce((a: number, m: any) => a + (m.text?.length || 0), 0) / msgs.length : 0;
  const types = new Set(msgs.map((m: any) => m.type));
  const hasMedia = types.has('image') || types.has('sticker');   // prova visual / figurinha
  const hasBlock = types.has('system') || /bloque|saiu da conversa/.test(allText);
  const polarized = /(quem (que )?(você|vc|tu) acha|quem (tá|esta) cert|ele ou ela|de que lado)/.test(allText);

  const hook = clamp((hookText.length >= 12 ? 70 : 45) + (/[😳👀😱🤯😡🚨]/.test(hookText) ? 14 : 0) + (shock ? 16 : 0), 0, 100);
  const curiosity = clamp(56 + (shock ? 20 : 0) + (cliff ? 16 : 0) + (polarized ? 12 : 0), 0, 100);
  const retention = clamp(100 - Math.abs(msgs.length - 14) * 4 - (avgLen > 80 ? 15 : 0) + (hasMedia ? 10 : 0), 40, 100);
  const emotion = clamp(45 + distinctEmo * 11 + nonNeutro * 35, 0, 100);
  const ending = clamp((story.part2_hook ? 32 : 0) + (/(bloquei|cancel|acabou|terminei|fim|reviravolta|plot twist|adivinha quem)/.test(allText) ? 46 : 20) + (hasBlock ? 12 : 0), 0, 100);
  const part2 = story.part2_hook ? clamp(72 + (String(story.part2_hook).length > 15 ? 22 : 0), 0, 100) : 45;

  const total = Math.round(hook * 0.26 + curiosity * 0.19 + retention * 0.13 + emotion * 0.17 + ending * 0.15 + part2 * 0.10);

  const suggestions: string[] = [];
  if (hook < 85) suggestions.push('Gancho mais chocante na 1ª mensagem (acusação/segredo/flagra com emoji).');
  if (!shock) suggestions.push('Aposte num conflito forte (folgado x sensato, traição, patrão abusivo) — gera revolta e comentário.');
  if (emotion < 80) suggestions.push('Varie a emoção de cada mensagem (raiva, surpresa, ironia) — nada de tudo neutro.');
  if (!cliff) suggestions.push('Adicione um mini-cliffhanger ("você não vai acreditar…", "senta que lá vem").');
  if (!cta) suggestions.push('Termine com chamada pra comentar ("o que você faria?").');
  if (!story.part2_hook) suggestions.push('Crie um gancho de parte 2 no final.');
  if (!suggestions.length) suggestions.push('Roteiro afiado — pronto pra postar! 🔥');

  return { hook, curiosity, retention, emotion, ending, part2, total, suggestions };
}
