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
