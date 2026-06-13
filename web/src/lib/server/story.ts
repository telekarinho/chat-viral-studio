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
      { id: 'c1', name: category === 'cliente maluco' ? 'Cliente' : 'Bem 💚', side: 'left' },
      { id: 'c2', name: 'Você', side: 'right' },
    ],
    messages,
    narration: 'Essa conversa começou tranquila… mas o final ninguém esperava. Presta atenção até o fim porque a última mensagem muda tudo.',
    hashtags: ['#fofoca', '#namoro', '#viral', '#parte2'],
    caption: 'Você ficaria bravo? 👀 #ficção',
    part2_hook: 'A reação dele na parte 2 foi PIOR…',
    viralScore: { hook: 84, curiosity: 80, retention: 74, emotion: 88, ending: 90, part2: 78, total: 82, suggestions: [] },
  }, params);
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

export function heuristicScore(story: any = {}): any {
  const msgs = story.messages || [];
  const hook = Math.min(100, (story.hook?.length ? 70 : 40) + (/[😳👀😱]/.test(story.hook || '') ? 15 : 0));
  const retention = Math.max(40, 100 - Math.abs(msgs.length - 14) * 3);
  const emotion = msgs.some((m: any) => m.emotion && m.emotion !== 'neutro') ? 80 : 60;
  const ending = story.part2_hook ? 88 : 65;
  const part2 = story.part2_hook ? 82 : 50;
  const curiosity = 75;
  const total = Math.round((hook + curiosity + retention + emotion + ending + part2) / 6);
  return {
    hook, curiosity, retention, emotion, ending, part2, total,
    suggestions: [
      total < 70 ? 'Reforce o gancho da 1ª mensagem com tensão imediata.' : 'Bom gancho — mantenha as falas curtas.',
      story.part2_hook ? 'Ótimo: já tem ponte para parte 2.' : 'Adicione um gancho de parte 2 no final.',
    ],
  };
}
