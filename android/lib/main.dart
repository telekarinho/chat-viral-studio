import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

// O app Android é um WebView do app web — mesma experiência completa (editor, voz,
// exportação, compartilhar) sem reimplementar nada nativo.
const String siteUrl = 'https://chat-viral-studio.vercel.app';

void main() => runApp(const ChatViralApp());

class ChatViralApp extends StatelessWidget {
  const ChatViralApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Chat Viral Studio',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF7C3AED),
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0E0B16),
      ),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});
  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    final controller = WebViewController.fromPlatformCreationParams(
      const PlatformWebViewControllerCreationParams(),
    );
    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0E0B16))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
          // Suporte ao bloqueio por senha (HTTP Basic Auth) do site.
          onHttpAuthRequest: (HttpAuthRequest request) async {
            final creds = await _askCredentials(request.host);
            if (creds != null) {
              request.onProceed(
                WebViewCredential(user: creds.$1, password: creds.$2),
              );
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(siteUrl));

    // Android: libera câmera/microfone (getUserMedia, p/ reação por câmera) e autoplay.
    if (controller.platform is AndroidWebViewController) {
      final android = controller.platform as AndroidWebViewController;
      android.setMediaPlaybackRequiresUserGesture(false);
      android.setOnPlatformPermissionRequest((request) => request.grant());
    }
    _controller = controller;
  }

  Future<(String, String)?> _askCredentials(String host) async {
    final user = TextEditingController(text: 'admin');
    final pass = TextEditingController();
    return showDialog<(String, String)?>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Acesso restrito'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Entre com sua senha para acessar $host'),
            const SizedBox(height: 12),
            TextField(
              controller: user,
              decoration: const InputDecoration(labelText: 'Usuário'),
            ),
            TextField(
              controller: pass,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Senha'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, (user.text, pass.text)),
            child: const Text('Entrar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else if (mounted) {
          Navigator.of(context).maybePop();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading)
                const Center(
                  child: CircularProgressIndicator(color: Color(0xFF7C3AED)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
