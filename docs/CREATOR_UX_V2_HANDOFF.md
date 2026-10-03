# Post.ai — Creator UX V2 handoff

## Objetivo

Transformar a experiência do Post.ai em um fluxo simples de creator app:

**Hoje → Diretor → Gravar → Revisar take → Montar → Aprovar → Publicar → Resultados**

O Claude continua como Diretor de Criação via MCP. O app não deve criar uma IA concorrente; ele deve executar e materializar a direção do Claude.

## O que já foi implementado neste branch

1. Navegação diária reduzida para Hoje / Gravar / Biblioteca / Resultados.
2. Plano foi removido da barra diária, mas continua acessível pela Home.
3. Aba Gravar ganhou destaque visual com botão central `+`.
4. Home ganhou um único `+ CRIAR` com ações contextuais:
   - gravar o que o Diretor pediu;
   - fala livre;
   - importar vídeo;
   - produto/prova;
   - curso;
   - patrimônio/pedido.
5. Projetos foi reposicionado conceitualmente como Biblioteca.
6. Biblioteca agora explica reutilização de takes e ativos pelo Diretor.
7. Tela Gravar abre com a próxima missão do Diretor em destaque.
8. Conteúdos com roteiro abrem gravação por partes por padrão nas missões dirigidas.
9. Tela de vídeo pronto mudou de `postar primeiro` para `assistir → aprovar → publicar`.
10. Ajustar/refazer continua disponível antes da aprovação.

## O que falta o dev finalizar

### 1. Validar Expo Router Tabs

Confirmar no Android e iOS que `href: null` em `plano` esconde corretamente a aba e mantém a rota acessível por `router.push('/(tabs)/plano')`.

Se a versão atual do expo-router não aceitar `href` em `options`, usar a API compatível da versão instalada sem alterar o comportamento desejado.

### 2. Home

Refinar visualmente:
- garantir que `+ CRIAR` não roube atenção do card AGORA;
- idealmente deixar o card AGORA antes do menu Criar;
- transformar PerfilSwitcher em cabeçalho compacto;
- mostrar claramente `X de Y missões` no topo;
- evitar repetição entre Conteúdos do dia e Missões de captação.

Objetivo: ao abrir o app, a primeira resposta visual deve ser **o que gravar agora**.

### 3. Camera / Modo Diretor

A câmera já possui teleprompter, direção, luz, timer, beleza, narrativa com música e gravação por partes.

Refinar:
- destacar `Como falar` e `Como filmar` em card compacto;
- manter controles técnicos em `Mais/Ajustes`;
- esconder resolução/FPS do fluxo principal;
- manter apenas Virar / Luz / Timer / Beleza / Texto / Mais na rail;
- mostrar claramente o papel da parte: GANCHO, CORPO, PROVA, CTA etc.;
- validar safe areas em iPhones com Dynamic Island e Android com barras de sistema.

### 4. Revisão do take

Depois de gravar, evoluir a tela atual para mostrar diagnóstico técnico objetivo:
- fala completa;
- áudio;
- enquadramento;
- estabilidade;
- duração.

Não criar `viral score` inventado.

Ações:
- USAR ESTE;
- GRAVAR NOVAMENTE;
- FAVORITAR TAKE.

Se houver vários takes da mesma parte, permitir escolher entre eles e marcar uma recomendação técnica.

### 5. Content screen

`content/[id]` ainda acumula funções demais.

Reorganizar por fase:

**Pré-gravação**
- objetivo do Diretor;
- gancho;
- estrutura;
- takes necessários;
- direção;
- botão CONTINUAR GRAVAÇÃO.

**Pós-gravação**
- material completo/incompleto;
- proposta do Diretor;
- FINALIZAR.

Ocultar métricas, publicação e opções avançadas enquanto não forem relevantes.

### 6. Tela Diretor

Criar bottom sheet/modal contextual, não nova aba fixa.

Deve mostrar:
- status do material;
- cenas faltantes;
- proposta de edição;
- mensagens/alterações do Claude;
- campo de texto para pedidos como `mais rápido`, `mais profissional`, `troca o começo`.

A alteração deve continuar fluindo pelo MCP e gerar novo EditPlan, sem timeline manual.

### 7. Finalizar

A tela já possui DirectorProposal e FinishOptions.

Refinar visualmente para:

**Seu Diretor montaria assim**
- estilo/intenção;
- duração;
- take do gancho;
- música;
- legenda;
- B-roll;
- capa.

CTA principal: `MONTAR ASSIM`.
Secundários: `AJUSTAR` e `PEDIR OUTRA IDEIA AO DIRETOR`.

Manter controles avançados escondidos até `AJUSTAR`.

### 8. Música

A biblioteca estilo TikTok já existe.

Refinar:
- bottom sheet/modal de altura grande;
- busca fixa no topo;
- tabs: Para você / Favoritas / Recentes / Minhas / categorias;
- mini player fixo no rodapé;
- escolha de trecho da música;
- volume fino;
- preview com voz;
- lista virtualizada;
- nunca criar um player por linha antes de tocar.

Nunca rotular `Em alta` sem fonte real.

### 9. Biblioteca

Expandir a nova Biblioteca para abas:
- Vídeos;
- Takes;
- B-roll;
- Provas;
- Roteiros;
- Músicas.

Adicionar busca e thumbnails quando possível.

O Diretor deve conseguir reutilizar ativos via MCP antes de solicitar novas gravações.

### 10. Resultados

Reposicionar a tela como `o que o Diretor aprendeu`.

Manter dados reais e amostra explícita.

Exibir, quando houver amostra suficiente:
- ganchos;
- duração;
- estilo;
- tema/pilar;
- música;
- horário;
- compartilhamentos/salvamentos;
- leads/vendas quando integrados.

Não fazer causalidade falsa nem score de viralização.

### 11. Plano

Mover definitivamente o conceito de Plano para configuração estratégica do perfil:
- pilares;
- metas;
- rotina;
- horários;
- obrigatoriedade;
- plataformas;
- regras do Diretor.

A Home deve executar o plano, não parecer uma tela de configuração.

### 12. Testes obrigatórios

Executar:
- typecheck;
- lint;
- unit/integration tests;
- Android build;
- iOS build;
- teste de navegação real em ambos;
- safe areas;
- teclado;
- back navigation;
- offline;
- perfil pessoal;
- perfil empresa.

Fluxo E2E obrigatório:

1. abrir Hoje;
2. trocar perfil;
3. gravar missão do Diretor;
4. gravar por partes;
5. revisar/retomar take;
6. finalizar;
7. aplicar proposta do Diretor;
8. abrir música, ouvir e favoritar;
9. montar;
10. continuar gravando enquanto renderiza;
11. assistir vídeo final;
12. ajustar/refazer;
13. aprovar;
14. publicar;
15. registrar métricas;
16. confirmar aprendizado em Resultados.

## Regra de produto

Não remover funcionalidades existentes para simplificar a UI. Ocultar por contexto ou mover para telas secundárias.

O usuário deve sentir:

**"Abro o app, ele me diz o que gravar, eu gravo, o Diretor monta, eu aprovo e posto."**
