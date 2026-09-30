# Editor automático — 30/09/2026

| Função | Como funciona | Onde |
|---|---|---|
| Corte de erros | Whisper → pausas > 0,8s encurtadas, falso começo (frase repetida) e muletas removidos; original intacto | `domain/cuts.ts`, `worker/job.ts editFromSpeech` |
| Voz limpa | highpass 90 Hz + redução de ruído leve + presença 3,2 kHz + compressor suave | `worker/render.ts` |
| Cenas de apoio | B-rolls do mesmo dia entram sobre partes longas (E / POR ISSO), voz continua | `assignBroll`, `findBrolls` |
| Gancho na tela | `screen_text` nos 3 primeiros segundos | `buildAss` estilo `gancho` |
| Capa | quadro do gancho (`<final>.jpg`) | `processJob` |
| Versão curta | gancho + virada + chamada (`render_jobs.plan.variant = "curto"`) | `SHORT_ROLES` |
| Fala livre / importar vídeo | sem roteiro; legenda e texto do post vêm da transcrição | `mobile/src/freeSpeech.ts` |
| Resultado visível | `render_jobs.result` (cortes, avisos, música, capa, transcrição) | app mostra avisos |
| Jobs travados | `claim_*` recupera após 20 min; `fail_stale_jobs`; 1 job ativo por conteúdo+versão | migration `202609300001` |

**Não implementado (limite técnico):** embelezamento ao vivo na câmera (exige processador de quadros nativo — quebrou o app no teste),
teleprompter que segue a voz e comandos de voz (Android não divide o microfone entre a gravação e o reconhecimento de fala),
aviso de luz/enquadramento antes de gravar (mesmo processador de quadros), publicar/agendar direto nas redes (exige API e aprovação de cada rede),
versão iPhone (exige conta Apple Developer).

---

# Legendas e música — implementado em 29/09/2026

- **Legenda da fala real**: o servidor transcreve cada parte com Whisper (local, grátis, modelo `small`, tempo por palavra);
  o roteiro entra só como dica de grafia. Sem Whisper disponível, cai para a legenda estimada pelo roteiro.
- **Estilos** (ASS/libass, `packages/domain/src/captions.ts`):
  - **Manuscrito** (padrão, o do print): Caveat Brush, creme `#F3E6CF`, caixa alta, contorno fino + sombra, ~63% da altura.
  - **Destaque**: Anton, branco com contorno; a palavra falada acende na cor do tema (`#FFD23F`) com leve “pop”.
  - **Limpo**: DejaVu Sans Bold, branco discreto. **Sem legenda**.
- **Música de fundo** (`packages/domain/src/music.ts`): 19 faixas Mixkit (licença de uso em vídeo, sem crédito obrigatório;
  não redistribuímos — o servidor baixa da origem e confere sha256). Clima automático pelo pilar (reflexão→piano,
  academia→treino, família→acústico, humor, empresa→corporativo) ou escolhido; volume baixinha/normal/mais alta;
  **ducking**: abaixa sozinha quando há fala; fade in/out.
- Escolhas ficam em `content_items.structured_payload.edit` e são **validadas no servidor** (`editChoices`).

---

# Legendas estilizadas, embelezamento e edição automática — especificação M3

Pedido do Rodrigo durante o beta (28/09/2026). **Fora do MVP** para não atrasar o beta diário; entra no M3 (Post-ready).

## Preset "Manuscrito" (referência enviada pelo Rodrigo)
Referência: close no rosto com a frase "PORQUE EU SOU CONTIGO…".
- Fonte manuscrita/pincel em **caixa alta** (candidatas open-source: *Caveat Brush*, *Permanent Marker*, *Gochi Hand* — validar com o Rodrigo).
- Cor creme/off-white (~`#F3E6CF`), **sem caixa de fundo**, sombra suave só para legibilidade.
- Centralizada horizontalmente, na altura do nariz/boca (≈ 60–65% da altura), dentro da safe-zone 9:16.
- Uma frase curta por vez (3–6 palavras), sem animação agressiva — nada de estilo "TikTok karaokê" por padrão.
- Reticências preservadas; nomes próprios sem forçar caixa alta quando o criador desligar.

Outros presets planejados: "Limpo" (sans-serif branca discreta) e "Destaque" (palavra-chave com cor do pilar). Estilo sempre opcional.

## Embelezamento sem forçar estilo
- Ajustes leves e naturais: exposição/temperatura automáticas, suavização de pele *baixa* e opcional (padrão desligado), sem filtros de rede social.
- Não altera traços faciais. Nunca aplicado em menores. Processado sobre o PROXY/FINAL — o ORIGINAL nunca é modificado.

## Edição automática para erros de gravação
Pipeline FFmpeg assíncrono (docs/VIDEO_PIPELINE.md):
1. Transcrição (Whisper) do take.
2. Detecção de silêncios longos e de **retakes** (frase repetida em sequência → mantém a última versão completa).
3. Corte de "é…", "ahn" e falsos começos opcional.
4. Normalização de áudio + redução de ruído leve.
5. Legendas do transcript revisado com o preset escolhido.
6. Export 9:16 com assinatura `RodrigoSerra.me`.
Tudo não destrutivo: gera FINAL a partir de ORIGINAL + metadados.

## 2K
Já disponível no beta: seletor 1080p / 2K / 4K na tela de gravação, exibido apenas quando o aparelho suporta.

## Assinaturas ChatGPT/Claude
As assinaturas de consumidor (ChatGPT Plus, Claude Pro) não liberam acesso de API para apps de terceiros via OAuth.
No beta existe o modo **"Gerar com meu ChatGPT/Claude"**: o app copia o pedido, o criador cola no app do assistente e cola a resposta de volta; o Post.ai valida com o mesmo contrato Zod e roda o anti-repetição. Sem custo de API.
