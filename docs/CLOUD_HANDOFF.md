# CLOUD HANDOFF — Post.ai

## Missão
Assuma este repositório como engenheiro principal e finalize o MVP Android do **Post.ai**, um copiloto diário para creators. Não entregue apenas análise: implemente, teste, corrija, gere evidências e deixe um APK instalável para beta do Rodrigo.

## Fonte de verdade
Leia antes de alterar código:
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE_V2.md`
- `docs/DATABASE.md`
- `docs/AI.md`
- `docs/VIDEO_PIPELINE.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `docs/MILESTONES.md`
- `docs/COMPETITIVE_RESEARCH_2026.md`

Branch inicial: `feat/creator-copilot-foundation`.
PR inicial: #53.
Issues: #49, #50, #51, #52.

## Regra de execução
1. Inspecione o estado real do repo e PR #53.
2. Não presuma que código/documentação existentes estão corretos: compile e teste.
3. Preserve o produto antigo quando possível, mas a nova arquitetura fica em `apps/mobile` + serviços/packages novos. Não continue Flutter para o Post.ai.
4. Faça commits pequenos e claros, atualize PRs/issues e mantenha `main` estável.
5. Nunca commite segredo. Crie/atualize `.env.example`.
6. Se um serviço externo exigir credencial/ação humana, implemente adapter/mock seguro, documente exatamente a variável/ação necessária e continue tudo que for possível sem bloquear o restante.
7. Não declare homologado sem evidência de build/teste e APK.

## Stack congelada
- Mobile: React Native + TypeScript strict + Expo Development Build + Expo Router.
- Câmera: `react-native-vision-camera` (ou substituto somente se houver incompatibilidade técnica comprovada/documentada).
- Local-first: SQLite + filesystem; credenciais em secure storage.
- Backend: NestJS + TypeScript.
- DB/Auth: Supabase/PostgreSQL + RLS.
- Storage: adapter S3-compatible; Supabase Storage inicialmente.
- IA: OpenAI API, Structured Outputs/JSON Schema validado com Zod.
- Jobs: Redis + BullMQ.
- Vídeo: FFmpeg assíncrono, ORIGINAL + PROXY + FINAL.
- Observabilidade: Sentry + PostHog.
- Notificações: Expo Notifications/FCM/APNs.

## MVP fechado — não expandir antes da homologação
O beta precisa permitir ao Rodrigo:
1. autenticar;
2. concluir onboarding/perfil;
3. configurar/usar pilares e percentuais;
4. configurar/usar rotina;
5. abrir `Hoje` e ver o que gravar agora;
6. ver progresso do dia;
7. executar FEITO, PULAR, NÃO ACONTECEU, REMARCAR, USAR OUTRA CENA;
8. gerar Pensamento do Dia;
9. gerar Vídeo Principal;
10. receber 3 ganchos e roteiro estruturado E -> MAS -> POR ISSO;
11. detectar repetição recente de tema/frase/metáfora/gancho/CTA;
12. transformar acontecimento digitado pelo usuário em conteúdo;
13. receber lembretes;
14. abrir teleprompter;
15. gravar câmera frontal/traseira;
16. persistir vídeo localmente antes de qualquer upload;
17. gravar offline sem perda;
18. sincronizar posteriormente com retry;
19. anexar take à tarefa;
20. navegar no banco de takes;
21. marcar conteúdo concluído;
22. gerar legenda/copy por Instagram, TikTok, Facebook e YouTube Shorts;
23. consultar histórico básico.

Fora do MVP: timeline CapCut-like, billing, equipes, social auto-publishing, analytics avançado, marketplace, editor avançado.

## Seed obrigatório Rodrigo
Workspace: RodrigoSerra.me.
Pilares: 40% reflexão; 20% vida real/homem 40+/maturidade; 15% academia/evolução; 10% família; 10% humor; 5% empreendedorismo.
Assinatura: `RodrigoSerra.me`.
Fechamento configurado: `E se der certo!`.
Tom: humano, próximo, simples, direto, esperançoso, conversa com uma pessoa, nunca guru/coaching genérico.
Rotina seg-sex conforme `supabase/seed.sql`.

## UX obrigatória
Navegação primária: Hoje / Plano / Gravar / Projetos / Resultados.
A primeira tela deve responder em poucos segundos: **“O que eu tenho que gravar agora?”**
Grandes áreas tocáveis, loading/error/empty states, labels de acessibilidade, contraste adequado.
As missões guiam; não culpabilizam o usuário por pular.

## IA
Implemente contratos estruturados e versionados. Salve request metadata, model, prompt version, resultado, edição do usuário e fingerprints.
Antes de gerar, consulte memória recente do workspace. Se similaridade exceder threshold, gere outro ângulo e informe de modo simples que o conceito recente foi evitado.
Nunca prometa viralização. Recomendações futuras são experimentos.
Chaves OpenAI somente no servidor.

## Câmera/teleprompter/offline — critério crítico
- 9:16.
- frontal/traseira.
- 1080p; 4K/FPS apenas quando capability do aparelho suportar.
- countdown.
- teleprompter: fonte, velocidade, espelho, pausa, restart, avanço manual.
- arquivo deve ser fechado/persistido localmente antes do upload.
- registro local com checksum/state.
- fila idempotente e retomável.
- queda de internet durante/depois da gravação não pode apagar o original.
- só permitir limpeza local após integridade remota confirmada e política permitir.

## Banco/LGPD
Finalize migration v1 e policies RLS reais; o arquivo inicial só habilita RLS e NÃO basta para produção.
Implemente workspace membership e policies que impeçam cross-tenant access.
Prever exportação/exclusão, retenção, signed URLs e audit log para operações sensíveis.
Não fazer reconhecimento facial de menores por padrão.
Não usar mídia privada para treinamento sem opt-in explícito.

## Testes mínimos obrigatórios
- unit: domínio de pilares, status, planejamento, schemas IA, anti-repetição.
- integração: auth/workspace, geração, tarefa, upload state machine, RLS cross-tenant.
- mobile component/integration: Hoje, ações de tarefa, teleprompter state.
- E2E/smoke Android: onboarding -> Hoje -> roteiro -> teleprompter -> gravar -> salvar local -> concluir -> legenda.
- offline: iniciar sem rede, gravar, matar/reabrir app, confirmar arquivo/fila, reconectar e sincronizar.
- privacy: usuário A não acessa dados/mídia do usuário B.

## CI/build
Corrija e valide `.github/workflows/postai-mobile-ci.yml` e `.github/workflows/postai-android-apk.yml`.
Garanta lockfile real versionado; não dependa de gerar lockfile dentro do CI como solução final.
CI deve rodar lint/typecheck/tests e APK debug/beta.
O APK final deve ser publicado como artifact (e release beta se apropriado), com instruções de instalação.

## Homologação final
Só marcar beta homologado quando TODOS estiverem verdadeiros:
- typecheck/lint verdes;
- testes verdes;
- migration + RLS testadas;
- fluxo crítico Android executado;
- teste offline executado;
- nenhum segredo no repo;
- crash/error logging configurado ou fallback documentado;
- APK Android gerado e artifact disponível;
- README/DEPLOYMENT/CHANGELOG atualizados;
- issues #49–#52 encerradas ou com justificativa explícita do que ficou fora do MVP;
- PR(s) revisados e mergeados em `main` somente depois dos checks.

## Entrega final esperada
Deixe um comentário final no GitHub contendo:
- commit/tag homologado;
- lista de checks e resultados;
- link/nome do artifact APK;
- versão Android;
- passos exatos para Rodrigo instalar;
- credenciais/variáveis que ainda dependam de configuração humana (sem valores secretos);
- limitações conhecidas;
- roteiro de teste de 10 minutos no aparelho.

Não pare em documentação. Execute até o limite real do ambiente cloud.