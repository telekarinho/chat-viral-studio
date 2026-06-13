# Instalação — Chat Viral Studio

## Pré-requisitos
- Node.js 18+ (recomendado 20+)
- FFmpeg (para exportar MP4 no backend) — `ffmpeg -version`
- (opcional) Chave Google Gemini e Google Cloud TTS

### Instalar FFmpeg
- **Ubuntu/Debian:** `sudo apt install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Windows:** baixe em https://ffmpeg.org e adicione ao PATH (ou ajuste `FFMPEG_PATH` no `.env`).

Sem FFmpeg, a exportação ainda funciona: o app baixa um **WebM** (aceito por TikTok/Reels/Shorts).

## 1) Backend
```bash
cd backend
cp .env.example .env        # edite: GEMINI_API_KEY, GOOGLE_TTS_API_KEY (opcionais)
npm install
npm run dev                 # http://localhost:4000
```
Teste: `curl http://localhost:4000/api/health`

> `better-sqlite3` compila um módulo nativo. Em Linux pode exigir `build-essential` e `python3`.
> Alternativa sem compilar: troque a implementação de `src/db.js` por Supabase/Firebase.

## 2) Web (Next.js PWA)
```bash
cd web
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:3000
```
Build de produção:
```bash
npm run build && npm start
```

## 3) Variáveis de ambiente

### Backend (`backend/.env`)
| Var | Para quê |
|---|---|
| `GEMINI_API_KEY` | Geração de histórias (sem ela → gerador mock local) |
| `GEMINI_MODEL` | Default `gemini-1.5-flash` |
| `GOOGLE_TTS_API_KEY` | Narração por voz (sem ela → placeholder de sincronia) |
| `FFMPEG_PATH` | Caminho do binário ffmpeg |
| `DB_PATH` / `MEDIA_DIR` | SQLite e mídia renderizada |
| `CORS_ORIGIN` | Origem do frontend |

### Web (`web/.env.local`)
| Var | Para quê |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL do backend |

## 4) Docker (opcional)
```bash
cd chat-viral-studio
docker compose up --build
# web → http://localhost:3000   |   api → http://localhost:4000
```
O serviço da API já inclui FFmpeg na imagem.

## 5) Android (Flutter)
Veja [`../android/README.md`](../android/README.md) para configurar o ambiente,
rodar em modo debug e gerar o APK release.
