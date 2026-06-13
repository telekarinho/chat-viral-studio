import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

// ── Configuração da API ───────────────────────────────────────────
// Em device físico use o IP da sua máquina (ex: http://192.168.0.10:4000).
const String apiBaseUrl = 'http://10.0.2.2:4000'; // 10.0.2.2 = localhost do host no emulador Android

void main() => runApp(const ChatViralApp());

class ChatViralApp extends StatelessWidget {
  const ChatViralApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Chat Viral Studio',
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF7C3AED),
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0E0B16),
      ),
      home: const HomeScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loading = false;
  Map<String, dynamic>? _story;
  String _category = 'namoro';

  Future<void> _generate() async {
    setState(() => _loading = true);
    try {
      final res = await http.post(
        Uri.parse('$apiBaseUrl/api/generate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'category': _category,
          'duration': 45,
          'intensity': 'médio',
          'emotion': 'engraçado',
          'ending': 'plot twist',
          'messageCount': 14,
        }),
      );
      final data = jsonDecode(res.body);
      setState(() => _story = data['story']);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro: $e — verifique apiBaseUrl/backend')),
        );
      }
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = (_story?['messages'] as List?) ?? [];
    final characters = (_story?['characters'] as List?) ?? [];
    String nameOf(String id) => characters
        .firstWhere((c) => c['id'] == id, orElse: () => {'name': id, 'side': 'left'})['name'];
    bool incoming(String id) => characters
        .firstWhere((c) => c['id'] == id, orElse: () => {'side': 'left'})['side'] == 'left';

    return Scaffold(
      appBar: AppBar(title: const Text('🎬 Chat Viral Studio')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(
                child: DropdownButton<String>(
                  value: _category,
                  isExpanded: true,
                  items: const ['namoro', 'cliente maluco', 'ciúmes', 'grupo da família']
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) => setState(() => _category = v!),
                ),
              ),
              const SizedBox(width: 12),
              FilledButton(
                onPressed: _loading ? null : _generate,
                child: Text(_loading ? '...' : '✨ Gerar'),
              ),
            ]),
          ),
          if (_story != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_story!['title'] ?? '',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
          Expanded(
            child: Container(
              margin: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFECE5DD),
                borderRadius: BorderRadius.circular(16),
              ),
              child: ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: messages.length,
                itemBuilder: (context, i) {
                  final m = messages[i] as Map<String, dynamic>;
                  final isIn = incoming(m['sender']);
                  return Align(
                    alignment: isIn ? Alignment.centerLeft : Alignment.centerRight,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      constraints: const BoxConstraints(maxWidth: 260),
                      decoration: BoxDecoration(
                        color: isIn ? Colors.white : const Color(0xFFDCF8C6),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(m['text'] ?? '', style: const TextStyle(color: Color(0xFF0B141A))),
                          Text(m['time'] ?? '',
                              style: const TextStyle(fontSize: 10, color: Color(0xFF667781))),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('História fictícia para entretenimento',
                style: TextStyle(fontSize: 11, color: Colors.white54)),
          ),
        ],
      ),
      // TODO fase 2: editor completo, TTS, teleprompter + câmera, export FFmpegKit.
    );
  }
}
