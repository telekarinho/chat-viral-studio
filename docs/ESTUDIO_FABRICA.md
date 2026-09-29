# Estúdio da fábrica ControlPot + Curso de Milk Shake — mapa (29/09/2026)

Status geral: **PROPOSTO / EM HOMOLOGAÇÃO**. Não é integração 100%: itens da MMIX abaixo seguem **A VALIDAR**.

## O que já existia
| Item | Onde |
|---|---|
| Perfil empresa ControlPot (dor → objeção → prova, nunca preço, alegações sem prova travadas) | `packages/domain/src/profiles.ts` |
| Gravação por partes, teleprompter, cronômetro (REC), repetir tomada, revisar o take na hora | `apps/mobile/app/record.tsx` |
| Montagem final grátis (FFmpeg), legendas, retoque leve | `apps/worker` |
| Ponte MMIX (pedidos de gravação de patrimônio, envio do take) | `apps/worker/src/mmix.ts` |
| MMIX: catálogo `produtos_catalogo`, fábrica, patrimônio, QA técnico de upload | repositório `controlpot-mmix` |

## O que foi implementado agora (Post.ai)
- **Estúdio**: recursos de gravação (mixers da parede, expresso, balde, bancada, insumos, copos, equipe, áudio, luz, enquadramento) e **biblioteca de tomadas reutilizáveis** (visão da fábrica, escolha do mixer, ingredientes, medida, preparo sem cortes, textura, copo, limpeza, CTA). `studio.ts`
- **Modos A–G** (demonstração, comece com balde, expresso × balde, aula, marketplace, suporte, autoridade), cada um com objetivo, plano de tomadas e travas; o briefing do modo vai para a IA. Tela **Novo projeto**.
- **Catálogo MMIX espelhado** (somente leitura, só mixers ControlPot, sem preço/estoque, sem franquias MilkyMoo/Johnny Joy) para escolher o **SKU exato** filmado. Sem segundo cadastro.
- **Metadados de cada clipe**: modo/projeto/aula, produto+SKU, fonte de sorvete, receita, tomada, capítulo, tempo de preparo *registrado* (referência, não promessa), medidas anotadas na hora, permissões, revisão.
- **Revisão** (roteiro × fala × legenda × equipamento × ingredientes × resultado × CTA + autorização de imagem e marcas). **Mixer diferente do SKU bloqueia** uso comercial.
- **Peças derivadas** (aula, trecho público, curto, página de produto, marketplace, suporte, campanha) guardam a origem; correção na origem **marca todas as derivadas** para revisão (`flag_derived_for_review`).
- **Curso**: estrutura editável de 13 módulos (sem nº de aulas, receita, medida, tempo ou preço fixos), aula → projeto modo D → revisão técnica → aprovação do Rodrigo. O app **não** marca aula como publicada.
- IA: roteiro que afirma alegação sem prova é **rejeitado e refeito** (como preço); o modo manual (ChatGPT/Claude) recusa o texto colado.

## A VALIDAR (não feito — depende da MMIX ou de decisão)
1. **Matrícula, acesso e compra do curso** na área do cliente MMIX, liberando aula só pelo estado canônico do pedido — precisa examinar/alterar o site MMIX (edição do repositório ainda não liberada nesta sessão).
2. **Gasto de crédito (HeyGen/TTS) e publicação**: o app Post.ai não gasta crédito (montagem é FFmpeg) e não publica — só exporta. Gates de crédito/publicação com confirmação e readback ficam no fluxo da fábrica MMIX.
3. **Kernel de Vídeos** (documentos ausentes com esse nome; existem `KERNEL-FABRICA.md`/`KERNEL-FILOSOFIA.md`) — não integrado ao app.
4. **Regras atuais de cada marketplace** para exportar — conferir na documentação oficial antes de criar presets.
5. **Captura horizontal 16:9** para aula — não implementada (app gravando 9:16).
6. Conferência automática da imagem do mixer (visão computacional) — hoje é checagem humana na revisão.

## Testes
| Teste | Tipo | Estado |
|---|---|---|
| Projeto com sorvete de balde + SKU ControlPot | domínio + integração Supabase | ✅ local (domínio) · CI (integração) |
| Projeto com sorvete expresso | domínio + integração | ✅ / CI |
| Gravação → aula e vídeo curto mantendo origem (+ derivada da derivada) | integração | CI |
| Produto/variante divergente bloqueado | domínio | ✅ |
| Claim sem evidência bloqueado (IA, manual, peça) | domínio + API | ✅ |
| Aula não publicada pelo app; isolamento entre usuários | integração | CI |
| Catálogo espelhado sem preço/franquias, só leitura | unit + integração | ✅ / CI |
| Aula vinculada à área do cliente e acesso conferido no pedido | — | **A VALIDAR** (MMIX) |
| Geração sem confirmação de crédito / publicação sem confirmação | — | **A VALIDAR** (fábrica MMIX; app não gasta nem publica) |
| Readback de job/arquivo/publicação | — | **A VALIDAR** (fábrica MMIX) |
