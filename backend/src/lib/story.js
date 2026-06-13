import { nanoid } from 'nanoid';

/** Ensures a story object has all fields the frontend expects + stable ids. */
export function normalizeStory(raw = {}, params = {}) {
  const characters = (raw.characters?.length ? raw.characters : [
    { id: 'c1', name: 'Contato', side: 'left', online: true },
    { id: 'c2', name: 'Você', side: 'right', online: true },
  ]).map((c, i) => ({
    id: c.id || `c${i + 1}`,
    name: c.name || (i === 0 ? 'Contato' : 'Você'),
    side: c.side || (i === 0 ? 'left' : 'right'),
    online: c.online ?? true,
    avatarColor: c.avatarColor || ['#25D366', '#34B7F1', '#FF7A59', '#A78BFA'][i % 4],
  }));
  const ids = new Set(characters.map((c) => c.id));

  let clock = 21 * 60 + 47; // 21:47 start
  const messages = (raw.messages || []).map((m, i) => {
    clock += Math.round((m.delay || 1.2) / 1.5);
    const hh = String(Math.floor(clock / 60) % 24).padStart(2, '0');
    const mm = String(clock % 60).padStart(2, '0');
    const sender = ids.has(m.sender) ? m.sender : characters[i % characters.length].id;
    return {
      id: m.id || `m${i + 1}`,
      sender,
      type: m.type || 'text',
      text: m.text || '',
      emotion: m.emotion || 'neutro',
      delay: clamp(Number(m.delay) || 1.2, 0.4, 4),
      time: m.time || `${hh}:${mm}`,
      status: m.status || 'read',
      audioUrl: m.audioUrl || null,
    };
  });

  return {
    id: raw.id || nanoid(),
    title: raw.title || 'História sem título',
    hook: raw.hook || '',
    category: params.category || raw.category || 'comédia',
    theme: raw.theme || 'verde',
    characters,
    messages,
    narration: raw.narration || '',
    hashtags: raw.hashtags?.length ? raw.hashtags : ['#viral', '#historia', '#fy'],
    caption: raw.caption || '',
    part2_hook: raw.part2_hook || '',
    fictionSeal: true,
    viralScore: raw.viralScore || null,
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Offline mock — believable structure so the whole pipeline works without Gemini. */
export function mockStory(params = {}) {
  const { category = 'namoro', ending = 'plot twist' } = params;
  const bank = {
    namoro: [
      ['c1', 'amor, vc tá acordado?'],
      ['c2', 'tô sim, aconteceu algo?'],
      ['c1', 'preciso te contar uma coisa…'],
      ['c2', 'me assustou agora 😳'],
      ['c1', 'lembra do meu "primo" que te apresentei?'],
      ['c2', 'lembro… o que tem ele'],
      ['c1', 'então… ele não é meu primo'],
      ['c2', 'COMO ASSIM não é teu primo'],
      ['c1', 'ele é meu chefe. eu menti pra te testar'],
      ['c2', 'testar o quê???'],
      ['c1', 'pra ver se vc ficava com ciúmes'],
      ['c2', 'e ele topou nessa palhaçada?'],
      ['c1', 'topou. e adivinha quem tá lendo isso agora'],
      ['c2', 'não brinca…'],
      ['c1', 'oi, sou o chefe dela 😅 ela esqueceu o cel aberto'],
    ],
    'cliente maluco': [
      ['c1', 'oi, o pedido chegou todo errado'],
      ['c2', 'oi! me diz o que veio diferente?'],
      ['c1', 'eu pedi pizza e veio… pizza'],
      ['c2', 'e qual seria o problema? 😅'],
      ['c1', 'eu QUERIA que viesse errado pra ganhar grátis'],
      ['c2', 'senhor, não funciona assim'],
      ['c1', 'então deixa errado de propósito'],
      ['c2', 'não posso fazer isso'],
      ['c1', 'vou avaliar com 1 estrela'],
      ['c2', 'a pizza tá certa…'],
      ['c1', 'por isso mesmo. tá certa DEMAIS'],
      ['c2', '???'],
      ['c1', 'esquece. manda outra. errada'],
      ['c2', 'vou ter que encerrar o atendimento 🙏'],
    ],
  };
  const lines = bank[category] || bank.namoro;
  const messages = lines.map(([sender, text], i) => ({
    sender,
    type: 'text',
    text,
    emotion: i === lines.length - 1 ? 'surpresa' : i % 3 === 0 ? 'ironia' : 'neutro',
    delay: 0.8 + (i % 3) * 0.5,
    status: 'read',
  }));

  return normalizeStory({
    title: category === 'cliente maluco' ? 'O cliente que QUERIA errar' : 'Ela mentiu pra me testar',
    hook: category === 'cliente maluco' ? 'Esse cliente queria o pedido ERRADO 😳' : 'Ela esqueceu o celular aberto…',
    characters: [
      { id: 'c1', name: category === 'cliente maluco' ? 'Cliente' : 'Bem 💚', side: 'left' },
      { id: 'c2', name: 'Você', side: 'right' },
    ],
    messages,
    narration:
      'Essa conversa começou tranquila… mas o final ninguém esperava. ' +
      'Presta atenção até o fim porque a última mensagem muda tudo.',
    hashtags: ['#fofoca', '#namoro', '#viral', '#parte2'],
    caption: 'Você ficaria bravo? 👀 #ficção',
    part2_hook: 'A reação dele na parte 2 foi PIOR…',
    viralScore: { hook: 84, curiosity: 80, retention: 74, emotion: 88, ending: 90, part2: 78, total: 82, suggestions: [] },
  }, params);
}
