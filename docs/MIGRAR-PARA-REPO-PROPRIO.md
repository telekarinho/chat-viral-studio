# Mover o Chat Viral Studio para um repositório próprio

Hoje ele vive numa subpasta do repo do MilkyPot (`telekarinho/1`). Estes passos
copiam **só** a pasta `chat-viral-studio/` para um repositório novo e limpo,
com tudo na raiz (`web/ backend/ android/ docs/`) — sem histórico do MilkyPot.

> Por que você faz e não a IA: a integração da sessão só tem acesso ao repo
> `telekarinho/1` e **não pode criar repositórios** nem dar push em outros.

## 1. Crie o repositório vazio
Em https://github.com/new:
- Owner: **telekarinho**
- Nome: **chat-viral-studio**
- **Não** marque "Add a README" (deixe vazio)
- Create repository

## 2. Copie a pasta e suba (no seu PC)
```bash
# Clona a branch que tem o código
git clone -b claude/blissful-rubin-suttw3 https://github.com/telekarinho/1.git _tmp_milkypot

# Entra só na pasta do projeto
cd _tmp_milkypot/chat-viral-studio

# Vira um repositório novo do zero
rm -rf .git
git init -b main
git add .
git commit -m "Chat Viral Studio — primeira versão"

# Aponta para o repo novo e envia
git remote add origin https://github.com/telekarinho/chat-viral-studio.git
git push -u origin main
```

Pronto — o código fica em `https://github.com/telekarinho/chat-viral-studio`
com a estrutura na raiz.

## 3. APK automático (já incluso)
O arquivo `.github/workflows/build-apk.yml` já vem na pasta com caminhos
relativos à raiz. No repo novo, todo push em `android/**` gera um APK e publica
em **Releases** (ou rode manualmente em Actions → *Build APK (Flutter)*).

## 4. Publicar o site na Vercel
Em https://vercel.com/new → importe **telekarinho/chat-viral-studio** →
**Root Directory = `web`** → (opcional) env vars `GEMINI_API_KEY` /
`GOOGLE_TTS_API_KEY`, deixe `NEXT_PUBLIC_API_URL` vazio → **Deploy**.

## 5. Limpeza (opcional)
Quando o repo novo estiver no ar, dá pra remover a pasta `chat-viral-studio/`
e o workflow `.github/workflows/build-chat-viral-apk.yml` do repo do MilkyPot
(fechando o PR #807), pra não ficar duplicado.
