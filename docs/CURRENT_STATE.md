# Post.ai — estado atual (2026-09-30)

**Status: BETA EM USO pelo Rodrigo.** App Android por GitHub Releases (`postai-beta-<sha>`, botão ATUALIZAR no app),
Supabase de produção `postai` (ref `knmndlvoavxgzttjuncv`, São Paulo), montagem no workflow *Post.ai Render Worker* (a cada 5 min, grátis).

## Pronto e verificado (CI: lint, unit, integração com Supabase local, E2E Android no emulador)
- Loop diário (Hoje → roteiro → teleprompter → gravar → legenda → próximo), gravação por partes, offline completo.
- Edição automática no servidor: legenda da fala (Whisper), cortes de erros/pausas, voz limpa, música com ducking,
  embelezamento só na pele, tirar tremido, cenas de apoio, gancho na tela, capa, versão curta. Ver [CAPTION_STYLES.md](CAPTION_STYLES.md).
- Vídeo final baixa sozinho; botão BAIXAR só aparece se o download automático falhar.
- Postar em 1 toque (TikTok, Instagram, YouTube Shorts, WhatsApp, outros).
- Perfis pessoal/empresa, estúdio da fábrica, catálogo ControlPot, curso. Ver [ESTUDIO_FABRICA.md](ESTUDIO_FABRICA.md).
- **30/09**: assinatura por perfil no canto do vídeo (canto escolhido em Perfis; guardado em `creator_profiles.tone.watermark`);
  aviso no celular quando o vídeo fica pronto/falha (com o app aberto ou ao voltar para ele — não há push do servidor);
  números dos posts (“Como foi este post?”, em `structured_payload.metrics`) e comparação por tema em Resultados;
  exclusão de conta LGPD processada pelo worker (`apps/worker/src/privacy.ts`).
- Produção: migration `202609300001_render_result_recovery` aplicada e função `generate` publicada em 30/09.

## Limites conhecidos (não implementado)
- Embelezamento ao vivo na câmera e aviso de luz/enquadramento (exigem processador de quadros nativo — quebrou o app no teste).
- Teleprompter que segue a voz / comandos de voz (Android não divide o microfone entre gravar e reconhecer fala).
- Publicar/agendar direto nas redes (API e aprovação de cada rede). Números dos posts são anotados à mão.
- Aviso de vídeo pronto com o app totalmente fechado (exige push via FCM configurado).
- Gravação horizontal 16:9 para aulas (câmera travada em retrato; a montagem gera só 9:16).
- iPhone (conta Apple Developer).

## Próximos passos técnicos
- Push de "vídeo pronto" com o app fechado (FCM + token por aparelho + envio pelo worker).
- Gravação e montagem 16:9 para o curso.
- Importar números das redes quando houver API oficial liberada.
- PostHog (M4). Convite de membros com consentimento.
