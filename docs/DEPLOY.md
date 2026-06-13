# Publicar online — Chat Viral Studio

Há **dois caminhos**. Para colocar o site no ar rápido (subdomínio Vercel), use o
**Modo Vercel (projeto único)** — não precisa hospedar backend separado.

---

## 🚀 Modo Vercel (projeto único) — recomendado pra ficar online

O site roda inteiro na Vercel: as APIs (Gemini, TTS, geração, viral-score) são
**rotas do próprio Next.js** (`web/src/app/api/*`). A biblioteca fica em
localStorage e a exportação gera **WebM** (aceito por TikTok/Reels/Shorts).
*(MP4 via FFmpeg só no Modo Backend abaixo.)*

### Passo a passo
1. Acesse https://vercel.com/new e **importe o repositório** `telekarinho/1`.
2. Em **Root Directory**, clique em *Edit* e selecione **`chat-viral-studio/web`**.
   - Framework: **Next.js** (detectado automaticamente).
3. **Environment Variables** (opcionais — sem elas tudo funciona em modo demo):
   | Nome | Valor |
   |---|---|
   | `GEMINI_API_KEY` | sua chave do Google AI Studio (histórias reais) |
   | `GOOGLE_TTS_API_KEY` | sua chave do Google Cloud TTS (vozes reais) |
   | `NEXT_PUBLIC_API_URL` | **deixe vazio** (ativa o modo same-origin) |
4. **Deploy**. Em ~1 min você recebe uma URL tipo
   `https://chat-viral-studio.vercel.app`.

> Como o repo já tem outro projeto Vercel (milkypot) apontando para a raiz, crie
> este como um **projeto Vercel separado** com Root Directory no subdiretório.
> Não há conflito — são dois projetos distintos no mesmo repositório.

### CLI (alternativa)
```bash
npm i -g vercel
cd chat-viral-studio/web
vercel            # primeira vez: vincula o projeto
vercel --prod     # publica em produção
```

---

## 🧩 Modo Backend completo (MP4 via FFmpeg + biblioteca SQLite)

Use quando quiser **exportar MP4 de verdade** e biblioteca compartilhada.

- **Web** → Vercel (Modo Vercel acima), mas defina
  `NEXT_PUBLIC_API_URL=https://SEU-BACKEND` nas env vars.
- **Backend** → hospede o `chat-viral-studio/backend` num provedor que rode
  Node + FFmpeg persistente:
  - **Render / Railway / Fly.io** (Docker) — use o `backend/Dockerfile` (já traz FFmpeg).
  - Defina `CORS_ORIGIN=https://SEU-SITE.vercel.app` e as chaves.
  - Exemplo Fly:
    ```bash
    cd chat-viral-studio/backend
    fly launch --dockerfile Dockerfile
    fly secrets set GEMINI_API_KEY=... GOOGLE_TTS_API_KEY=... CORS_ORIGIN=https://SEU-SITE.vercel.app
    fly deploy
    ```

> A Vercel (serverless) **não** roda FFmpeg/Express persistente bem — por isso o
> backend de MP4 vai num host de containers. O site continua na Vercel.

---

## ✅ Resumo

| Quero… | Faça |
|---|---|
| Site online agora (subdomínio Vercel) | Modo Vercel, Root Directory `chat-viral-studio/web` |
| Exportar MP4 real | + Backend em Render/Railway/Fly e `NEXT_PUBLIC_API_URL` |
| Tudo local no PC | `docs/INSTALL.md` |
