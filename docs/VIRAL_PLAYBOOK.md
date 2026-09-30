# Playbook de vídeo curto — o que viraliza e como gravar (pesquisa 30/09/2026)

Nenhuma plataforma publica uma fórmula; abaixo, só o que elas confirmam + práticas bem estabelecidas,
e onde cada item vive no Post.ai. Nunca prometemos viralização.

## O que as plataformas confirmam
| Fonte | O que diz | No Post.ai |
|---|---|---|
| TikTok Creator Academy (“Understanding and engaging your audience”, atualizado 18/08/2026) | Os primeiros segundos são os mais críticos; texto ou fala de abertura que deixa claro do que é o vídeo; ganchos: pergunta respondida no fim, mostrar o resultado antes, tempo (“em 2 min”), FOMO/lista (“5 coisas que aprendi”); testar durações e olhar onde o público sai; responder comentários. | Prompt da IA (`VIRAL_FORMATS`, regras de retenção); gancho na tela nos 3 s; Resultados. |
| Adam Mosseri (Instagram), jan/2025, reafirmado em 2026 | Os 3 sinais que mais pesam: **tempo assistido, curtidas por alcance e envios por alcance** (envio pesa mais para quem não segue). Conteúdo original e “real” favorecido. | CTA “manda para quem…”; Resultados mostra **envios a cada mil**; nada de conteúdo reciclado. |
| TikTok (explicação das recomendações) | Interações, informação do vídeo (legenda, som, fala) e tempo assistido contam; não há limite oficial de “3 s”. | 1ª frase com o assunto (a fala é transcrita e usada na busca). |

## Práticas de roteiro (aplicadas no prompt, `packages/domain/src/ai/prompt.ts`)
- Gancho visual + falado + contexto nos primeiros ~3 s; sem “oi, gente”, sem contexto antes do gancho.
- Uma ideia só; cada frase continua a anterior; o final entrega o que o gancho prometeu.
- Formatos sempre-verdes: “ninguém te conta que…”, antes/depois, confissão com aprendizado, pergunta direta,
  contraste, cena concreta do dia, lista de 3.
- Pensamento do Dia: 3–5 frases; a 1ª é o gancho (gravada sozinha).

## Como gravar (dicas na tela de gravação, `packages/domain/src/recordingTips.ts`)
- Luz de frente para o rosto, celular na altura dos olhos, rosto no terço de cima, lugar sem eco.
- Começar já falando no 1º segundo, olhando na lente; falar para UMA pessoa.
- Virada com mudança de tom; frase principal devagar; segurar 1 s no final.

## Edição (já automática no servidor)
Corte do toque do botão e de pausas/muletas, zoom/cortes entre partes, legenda sincronizada em blocos curtos,
gancho escrito no 1º quadro, música baixa com ducking, capa do quadro do gancho.

## Limites
- Não lemos tendências do dia (sem API oficial liberada para isso): usamos formatos que funcionam sempre.
- Tempo assistido e envios só entram se anotados à mão em “Como foi este post?”.

Fontes: TikTok Creator Academy (tiktok.com/creator-academy, artigo acima); resumo das declarações de Mosseri em
highstyle.ai/insights/instagram-reels-algorithm-2026 e kompozy.io/news/instagram-mosseri-ranking-signals-guidance;
checklist de retenção em hypenest.ai/blogs/tiktok-algorithm-2026-video-hooks-retention (práticas, rotuladas como hipótese pela própria fonte).
