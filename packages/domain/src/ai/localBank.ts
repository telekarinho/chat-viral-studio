import type { NarrativeStructure } from "./contract";

export interface BankSeed {
  pillar: string;
  structure: NarrativeStructure;
  topic: string;
  key_phrase: string;
  metaphor: string;
  hooks: [string, string, string];
  e: string;
  mas: string;
  por_isso: string;
  screen_text: string;
  scenes: string[];
}

/**
 * Offline content bank in Rodrigo's voice. Used when the API is not configured or unreachable,
 * so the daily loop never depends on network. Every seed still goes through the Zod contract
 * and the repetition guard.
 */
export const LOCAL_BANK: readonly BankSeed[] = [
  // reflexao (40%)
  {
    pillar: "reflexao", structure: "conselho", topic: "pequenas escolhas diárias que o futuro agradece",
    key_phrase: "Talvez você não precise mudar sua vida inteira hoje. Talvez só precise fazer hoje uma coisa que o seu futuro vai agradecer.",
    metaphor: "o futuro como alguém que agradece",
    hooks: ["Você não precisa mudar tudo hoje.", "Qual foi a última coisa que você fez pelo seu eu de daqui a um ano?", "Eu demorei 40 anos pra entender isso aqui."],
    e: "A gente acorda achando que precisa virar outra pessoa até sexta-feira.", mas: "Mudança de verdade quase nunca chega de uma vez; ela chega numa escolha pequena, repetida.", por_isso: "Escolhe uma coisa hoje. Só uma. E faz.",
    screen_text: "Uma coisa hoje.", scenes: ["caminhando na rua de manhã", "close no café"],
  },
  {
    pillar: "reflexao", structure: "confissao", topic: "cansaço não é o mesmo que desistir",
    key_phrase: "Tem dia que o máximo que eu consigo é não desistir. E tudo bem, isso também conta.",
    metaphor: "dia ruim como degrau baixo da escada",
    hooks: ["Hoje eu quase não vim gravar.", "Nem todo dia é dia de dar 100%.", "Quem disse que dia fraco não conta?"],
    e: "Hoje eu acordei sem vontade nenhuma.", mas: "Eu aprendi que dia fraco também é degrau, só que mais baixo.", por_isso: "Se hoje só der pra não parar, não para. Amanhã você sobe mais um.",
    screen_text: "Dia fraco também conta.", scenes: ["sentado no carro antes de sair", "tênis sendo amarrado"],
  },
  {
    pillar: "reflexao", structure: "pergunta", topic: "comparação com a vida dos outros",
    key_phrase: "Você está comparando o seu bastidor com o palco dos outros.",
    metaphor: "bastidor versus palco",
    hooks: ["Por que a vida dos outros parece tão mais fácil?", "Rolou o feed e ficou pior? Escuta isso.", "Ninguém posta o bastidor."],
    e: "A gente abre o celular e todo mundo parece estar vencendo.", mas: "Você está vendo o palco deles e vivendo o seu bastidor.", por_isso: "Compara você com você de ontem. Esse é o único jogo justo.",
    screen_text: "Você de ontem.", scenes: ["mão fechando o celular", "janela com luz do fim da tarde"],
  },
  {
    pillar: "reflexao", structure: "contraste", topic: "constância em vez de intensidade",
    key_phrase: "Intensidade impressiona, mas é a constância que muda a vida.",
    metaphor: "gota que fura a pedra",
    hooks: ["Intensidade é superestimada.", "Você começa forte e para em duas semanas?", "O segredo chato que ninguém quer ouvir."],
    e: "Todo começo de mês eu prometia treinar todo dia, ler um livro por semana.", mas: "Em duas semanas eu tinha parado tudo.", por_isso: "Hoje eu prefiro fazer pouco todo dia do que muito uma vez.",
    screen_text: "Pouco, todo dia.", scenes: ["calendário marcado", "passos na calçada"],
  },
  // vida-real (20%)
  {
    pillar: "vida-real", structure: "observacao", topic: "chegar aos 40 sem ter tudo resolvido",
    key_phrase: "Chegar aos 40 sem ter tudo resolvido não é atraso, é vida real.",
    metaphor: "",
    hooks: ["Aos 40 eu achava que ia ter tudo resolvido.", "Ninguém te conta isso sobre os 40.", "Se você tem mais de 40, isso é pra você."],
    e: "Quando eu tinha 20, achava que aos 40 estaria com a vida pronta.", mas: "Cheguei aqui ainda aprendendo, errando e recomeçando algumas coisas.", por_isso: "Não é atraso. É estar vivo e ainda querendo melhorar.",
    screen_text: "Ainda aprendendo.", scenes: ["reflexo no espelho do carro", "caminhada no fim do expediente"],
  },
  {
    pillar: "vida-real", structure: "historia", topic: "o corpo avisando que o tempo passou",
    key_phrase: "Depois dos 40, o corpo para de aceitar desculpa.",
    metaphor: "corpo como cobrador educado",
    hooks: ["Meu joelho me mandou um recado hoje.", "Depois dos 40 o corpo cobra.", "Ninguém me avisou dessa parte."],
    e: "Subi uma escada hoje e senti o joelho reclamar.", mas: "Não é sinal pra parar, é sinal pra cuidar melhor.", por_isso: "Cuidar do corpo agora é o favor que eu faço pro Rodrigo de 60.",
    screen_text: "Cuidar agora.", scenes: ["subindo escada", "alongamento rápido"],
  },
  {
    pillar: "vida-real", structure: "confissao", topic: "admitir que errou",
    key_phrase: "Maturidade é conseguir dizer 'eu errei' sem precisar de plateia.",
    metaphor: "",
    hooks: ["Hoje eu precisei pedir desculpa.", "A frase mais difícil depois dos 40.", "Eu errei. E tá tudo bem falar isso."],
    e: "Hoje eu fui duro com alguém sem necessidade.", mas: "O orgulho quis me convencer que eu tinha razão.", por_isso: "Pedi desculpa. Custou menos do que carregar isso o dia inteiro.",
    screen_text: "Eu errei.", scenes: ["olhar pela janela", "mãos no volante"],
  },
  // academia (15%)
  {
    pillar: "academia", structure: "contraste", topic: "treinar sem vontade",
    key_phrase: "Vontade é visita. Disciplina é quem mora em casa.",
    metaphor: "vontade como visita",
    hooks: ["Hoje eu não queria treinar.", "Motivação não aparece todo dia.", "O treino que mais vale é esse aqui."],
    e: "Saí do trabalho cansado e sem vontade nenhuma de treinar.", mas: "Se eu fosse depender de vontade, eu treinava duas vezes por mês.", por_isso: "Vim mesmo assim. Vontade vem e vai, o hábito fica.",
    screen_text: "Vim mesmo assim.", scenes: ["entrada da academia", "mochila no ombro"],
  },
  {
    pillar: "academia", structure: "observacao", topic: "evolução lenta que ninguém vê",
    key_phrase: "Evolução de verdade é tão lenta que só aparece quando você olha pra trás.",
    metaphor: "foto antiga versus espelho",
    hooks: ["Ninguém percebe sua evolução no dia a dia.", "O espelho mente, a foto antiga não.", "Três meses atrás eu não levantava isso."],
    e: "Todo dia eu olho no espelho e parece que nada mudou.", mas: "Aí eu vejo uma foto de seis meses atrás e levo um susto.", por_isso: "Não mede o progresso pelo dia. Mede pelo tempo.",
    screen_text: "Olha pra trás.", scenes: ["série de exercício", "anotação da carga"],
  },
  {
    pillar: "academia", structure: "conselho", topic: "começar com pouco peso",
    key_phrase: "O ego quer a carga pesada. O corpo quer a carga certa.",
    metaphor: "",
    hooks: ["Diminui o peso. Sério.", "Eu me machuquei por causa disso.", "O erro que todo mundo 40+ comete na academia."],
    e: "Eu já quis provar pra mim mesmo que ainda aguentava o peso de antes.", mas: "Quem pagou a conta foi o ombro.", por_isso: "Hoje eu treino com a carga certa. Sem pressa, sem lesão.",
    screen_text: "Carga certa.", scenes: ["halteres no chão", "ajuste de aparelho"],
  },
  // familia (10%)
  {
    pillar: "familia", structure: "historia", topic: "presença em casa depois do trabalho",
    key_phrase: "Eles não lembram do dia que você chegou cansado. Lembram do dia que você chegou presente.",
    metaphor: "",
    hooks: ["Cheguei em casa e deixei o celular no carro.", "O que minha família precisa não é mais tempo, é outra coisa.", "Presença não é estar no mesmo lugar."],
    e: "Eu chegava em casa, mas continuava no trabalho pelo celular.", mas: "Estar em casa não é o mesmo que estar presente.", por_isso: "Agora os primeiros minutos em casa são deles.",
    screen_text: "Presença.", scenes: ["porta de casa se abrindo", "mesa de jantar (sem rostos de crianças)"],
  },
  {
    pillar: "familia", structure: "confissao", topic: "exemplo dentro de casa",
    key_phrase: "Filho aprende mais com o que vê do que com o que escuta.",
    metaphor: "",
    hooks: ["Meu filho me copiou hoje. E eu não gostei.", "Discurso não educa.", "O que você faz em casa ensina mais do que você fala."],
    e: "Hoje eu reparei que repetiram uma atitude minha em casa.", mas: "Não era uma das minhas melhores.", por_isso: "Se eu quero que eles sejam melhores, eu tenho que ser primeiro.",
    screen_text: "Exemplo.", scenes: ["tênis na porta", "caminhada ao entardecer"],
  },
  // humor (10%)
  {
    pillar: "humor", structure: "observacao", topic: "a academia depois dos 40",
    key_phrase: "Aos 20 eu treinava pra ficar forte. Aos 40 eu treino pra conseguir levantar da cadeira sem fazer barulho.",
    metaphor: "",
    hooks: ["Treino depois dos 40: expectativa x realidade.", "O barulho que eu faço pra levantar do sofá.", "Ninguém fala dessa meta na academia."],
    e: "Aos 20 eu queria braço grande.", mas: "Aos 40 minha meta é abaixar pra amarrar o tênis sem gemer.", por_isso: "Cada idade tem seu troféu. O meu é esse.",
    screen_text: "Meta: sem gemer.", scenes: ["amarrando o tênis", "sentando e levantando"],
  },
  {
    pillar: "humor", structure: "contraste", topic: "planejamento de segunda-feira",
    key_phrase: "Toda segunda eu viro outra pessoa. Na terça eu volto.",
    metaphor: "",
    hooks: ["O Rodrigo de segunda-feira é outro nível.", "Plano de segunda, realidade de terça.", "Quem nunca?"],
    e: "Segunda-feira eu acordo pronto pra mudar de vida.", mas: "Terça o despertador toca e o velho Rodrigo aparece.", por_isso: "Por isso eu parei de planejar a semana e comecei a planejar o dia.",
    screen_text: "Planeja o dia.", scenes: ["despertador", "café sendo servido"],
  },
  // empreendedorismo (5%)
  {
    pillar: "empreendedorismo", structure: "conselho", topic: "começar antes de estar pronto",
    key_phrase: "Se eu esperasse estar pronto, eu ainda estaria esperando.",
    metaphor: "",
    hooks: ["Eu comecei sem estar pronto.", "Pronto é um lugar que não existe.", "O erro que atrasou meu negócio em anos."],
    e: "Eu passei muito tempo esperando o momento certo pra começar.", mas: "O momento certo nunca chegou; eu só fui ficando mais velho esperando.", por_isso: "Começa pequeno, começa imperfeito, mas começa.",
    screen_text: "Começa.", scenes: ["chegando na empresa", "mesa de trabalho"],
  },
  {
    pillar: "empreendedorismo", structure: "historia", topic: "problema do dia na empresa",
    key_phrase: "Problema na empresa não é sinal de fracasso, é sinal de que ela está viva.",
    metaphor: "empresa como organismo vivo",
    hooks: ["Hoje deu tudo errado no trabalho.", "Ninguém fala dos dias ruins de quem empreende.", "Empresa sem problema é empresa parada."],
    e: "Hoje apareceu um problema no trabalho que eu não esperava.", mas: "Antes eu achava que problema era sinal de que eu estava fazendo errado.", por_isso: "Hoje eu sei que é o preço de estar construindo alguma coisa.",
    screen_text: "Ela está viva.", scenes: ["tela do computador", "corredor da empresa"],
  },
];

export const LOCAL_CTAS: readonly string[] = [
  "Manda pra alguém que precisa ouvir isso hoje.",
  "Comenta aqui qual é a sua uma coisa de hoje.",
  "Salva pra ver de novo num dia difícil.",
  "Me conta se você também passa por isso.",
  "Segue pra gente continuar essa conversa amanhã.",
];

export const PILLAR_HASHTAGS: Record<string, string[]> = {
  reflexao: ["#reflexao", "#vidareal", "#evolucaopessoal"],
  "vida-real": ["#homem40", "#vidareal", "#maturidade"],
  academia: ["#academia", "#treino40", "#disciplina"],
  familia: ["#familia", "#paternidade", "#presenca"],
  humor: ["#humor", "#vidareal", "#40mais"],
  empreendedorismo: ["#empreendedorismo", "#negocios", "#vidareal"],
};
