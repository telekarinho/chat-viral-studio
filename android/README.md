# Chat Viral Studio — App Android (Flutter)

> **Status:** scaffold funcional + guia de build. O app consome a **mesma API REST**
> do backend (geração, TTS, projetos) e renderiza/exporta MP4 localmente com
> **FFmpegKit**. A paridade total de UI com o web é fase 2.

## Por que Flutter
- Um código → APK Android (e iOS depois).
- `camera` + `record` (microfone) nativos.
- `ffmpeg_kit_flutter` faz o render/transcode MP4 **no aparelho** (offline).
- `RepaintBoundary` captura o widget do chat como frames para o vídeo.

## Estrutura sugerida
```
android/
├── pubspec.yaml
├── lib/
│   ├── main.dart                 # app + navegação
│   ├── api/api_client.dart       # chama o backend (generate, tts, projects)
│   ├── models/story.dart         # espelha o schema Story do backend
│   ├── widgets/chat_view.dart    # bolhas estilo "Chat Verde" (sem marcas)
│   ├── screens/create_screen.dart
│   ├── screens/editor_screen.dart
│   ├── screens/record_screen.dart # teleprompter + câmera + mic
│   └── video/exporter.dart       # frames + FFmpegKit → MP4
└── android/ (gerado pelo `flutter create`)
```

## Setup
```bash
# 1. Instale o Flutter (https://docs.flutter.dev/get-started/install)
flutter --version            # 3.22+

# 2. Gere a casca nativa dentro desta pasta
cd chat-viral-studio/android
flutter create . --org com.chatviral --project-name chat_viral_studio

# 3. Substitua pubspec.yaml e lib/ pelos arquivos deste scaffold, depois:
flutter pub get

# 4. Aponte a API (use o IP da sua máquina, não localhost, no device físico)
#    edite lib/api/api_client.dart -> baseUrl

# 5. Rodar em debug
flutter run
```

## Permissões (android/app/src/main/AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
```

## Gerar APK
```bash
# APK debug (instalável direto)
flutter build apk --debug
# saída: build/app/outputs/flutter-apk/app-debug.apk

# APK release (assinado)
keytool -genkey -v -keystore ~/cvs-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias cvs
# crie android/key.properties e configure signingConfigs em android/app/build.gradle (ver docs Flutter)
flutter build apk --release
# saída: build/app/outputs/flutter-apk/app-release.apk

# App Bundle para a Play Store
flutter build appbundle --release
```

## Render local com FFmpegKit (resumo de `video/exporter.dart`)
1. Reproduza a timeline do chat capturando `RepaintBoundary` em ~30fps → PNGs.
2. Gere/baixe a narração (endpoint `/api/tts`) → arquivos `.mp3`.
3. Monte com FFmpegKit:
   ```
   ffmpeg -framerate 30 -i frame_%04d.png -i narration.mp3 \
     -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" \
     -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart out.mp4
   ```
4. Salve em `getExternalStorageDirectory()` e ofereça compartilhamento.

Veja `pubspec.yaml` e `lib/main.dart` neste diretório para o ponto de partida.
```
```
