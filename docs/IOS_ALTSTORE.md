# Post.ai no iPhone sem conta paga da Apple (AltStore)

Grátis, com a Apple ID normal. Limites da Apple para conta gratuita: o app precisa ser **renovado a cada 7 dias**
(o AltStore renova sozinho quando o iPhone e o PC com AltServer estão no mesmo Wi-Fi) e no máximo 3 apps assim.
Renovar NÃO apaga nada; apagar o app apaga o que só estava no iPhone (vídeos que ainda não subiram e o histórico de roteiros).

## 1. Uma vez no PC (Windows) — passos oficiais do AltStore (faq.altstore.io)
1. Instale **iTunes** e **iCloud** baixados direto da Apple (não da Microsoft Store):
   - iTunes: https://www.apple.com/itunes/download/win64
   - iCloud: link na página oficial do AltStore (Troubleshooting se só tiver a versão da Microsoft Store).
2. Baixe o **AltServer para Windows** em https://altstore.io, extraia e rode `Setup.exe`.
3. Busque “AltServer” no Windows → **Executar como administrador** (permita redes privadas). Aparece um ícone perto do relógio.
4. Ligue o iPhone no cabo, desbloqueado, e toque em **Confiar**.
5. Abra o iTunes, entre com a sua Apple ID e ative **Sincronizar por Wi-Fi** para o iPhone.
6. Ícone do AltServer → **Install AltStore** → escolha o iPhone → digite **você mesmo** a Apple ID e a senha (vão só para a Apple).
7. No iPhone: Ajustes → Geral → **VPN e Gerenciamento de Dispositivos** → confiar na sua Apple ID.
8. iOS 16 ou mais novo: Ajustes → Privacidade e Segurança → **Modo de Desenvolvedor** → ligar (o iPhone reinicia).

## 2. Instalar o Post.ai
1. No iPhone, abra no Safari a página de releases: https://github.com/telekarinho/chat-viral-studio/releases
   e baixe o arquivo `post-ai-ios-<código>.ipa` do release **Post.ai iPhone** mais recente.
2. Abra o **AltStore** → **My Apps** → **+** → escolha o `.ipa` em Arquivos/Downloads.
3. Entre no Post.ai com o mesmo e-mail do Android: perfis, plano e vídeos já sincronizados vêm da nuvem.

## 3. Toda semana
O AltStore renova sozinho com o PC ligado no mesmo Wi-Fi. Se aparecer aviso de expiração: AltStore → My Apps → **Refresh All**.
Versão nova do Post.ai: baixe o `.ipa` novo e instale por cima pelo AltStore (os dados ficam).

## Diferenças no iPhone (por enquanto)
- **Postar** abre a tela de compartilhar do iOS (a legenda já vai copiada); no Android abre direto o app escolhido.
- **ATUALIZAR** dentro do app não existe no iPhone: atualização é pelo AltStore.
- **Importar vídeo** abre o app Arquivos (vídeo da galeria: salve em Arquivos antes).
- Não testado num iPhone real pela equipe ainda — primeiro uso é a homologação.

Gerar o `.ipa`: Actions → **Post.ai iOS (AltStore)** → Run workflow (Mac grátis do GitHub, repositório público).
