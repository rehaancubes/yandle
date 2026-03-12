import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api_config.dart';
import '../services/auth_service.dart';

class AdminProfilePage extends StatefulWidget {
  final String handle;
  final String? displayName;
  final String? useCase;
  final VoidCallback onToggleOff;

  const AdminProfilePage({
    super.key,
    required this.handle,
    this.displayName,
    this.useCase,
    required this.onToggleOff,
  });

  @override
  State<AdminProfilePage> createState() => _AdminProfilePageState();
}

class _AdminProfilePageState extends State<AdminProfilePage> {
  String _selectedVoice = 'tiffany';
  String _persona = '';
  String _knowledgeBaseCustomText = '';
  int? _credits;
  int? _totalUsed;
  bool _loading = true;
  bool _savingVoice = false;
  bool _savingPersona = false;
  bool _savingKb = false;

  static const _voices = [
    {'id': 'tiffany', 'label': 'Tiffany (English US, female)'},
    {'id': 'matthew', 'label': 'Matthew (English US, male)'},
    {'id': 'amy', 'label': 'Amy (English UK, female)'},
    {'id': 'olivia', 'label': 'Olivia (English AU, female)'},
    {'id': 'kiara', 'label': 'Kiara (English IN / Hindi, female)'},
    {'id': 'arjun', 'label': 'Arjun (English IN / Hindi, male)'},
    {'id': 'lupe', 'label': 'Lupe (Spanish US, female)'},
    {'id': 'carlos', 'label': 'Carlos (Spanish US, male)'},
    {'id': 'ambre', 'label': 'Ambre (French, female)'},
    {'id': 'florian', 'label': 'Florian (French, male)'},
    {'id': 'tina', 'label': 'Tina (German, female)'},
    {'id': 'lennart', 'label': 'Lennart (German, male)'},
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final token = await AuthService.getIdToken();
      if (token == null) return;

      // Load profile and credits in parallel
      final results = await Future.wait([
        http.get(
          Uri.parse('$apiBase/handles?handle=${Uri.encodeComponent(widget.handle)}'),
          headers: {'authorization': 'Bearer $token'},
        ),
        http.get(
          Uri.parse('$apiBase/credits?handle=${Uri.encodeComponent(widget.handle)}'),
          headers: {'authorization': 'Bearer $token'},
        ),
      ]);

      final profileRes = results[0];
      final creditsRes = results[1];

      if (profileRes.statusCode == 200) {
        final data = jsonDecode(profileRes.body) as Map<String, dynamic>;
        final profile = data['profile'] as Map<String, dynamic>? ?? {};
        if (mounted) {
          setState(() {
            _selectedVoice = profile['voiceId'] as String? ?? 'tiffany';
            _persona = profile['persona'] as String? ?? '';
            _knowledgeBaseCustomText =
                profile['knowledgeBaseCustomText'] as String? ?? '';
          });
        }
      }

      if (creditsRes.statusCode == 200) {
        final data = jsonDecode(creditsRes.body) as Map<String, dynamic>;
        if (mounted) {
          setState(() {
            _credits = data['credits'] as int?;
            _totalUsed = data['totalCreditsUsed'] as int?;
          });
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _saveVoice() async {
    setState(() => _savingVoice = true);
    try {
      final token = await AuthService.getIdToken();
      await http.post(
        Uri.parse('$apiBase/handle'),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({'handle': widget.handle, 'voiceId': _selectedVoice}),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Voice updated'),
              backgroundColor: Color(0xFF22C55E)),
        );
      }
    } catch (_) {}
    if (mounted) setState(() => _savingVoice = false);
  }

  Future<void> _savePersona() async {
    setState(() => _savingPersona = true);
    try {
      final token = await AuthService.getIdToken();
      await http.post(
        Uri.parse('$apiBase/handle'),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({'handle': widget.handle, 'persona': _persona}),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Persona saved'),
              backgroundColor: Color(0xFF22C55E)),
        );
      }
    } catch (_) {}
    if (mounted) setState(() => _savingPersona = false);
  }

  Future<void> _saveKb() async {
    setState(() => _savingKb = true);
    try {
      final token = await AuthService.getIdToken();
      await http.post(
        Uri.parse('$apiBase/handle'),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'handle': widget.handle,
          'displayName': widget.displayName ?? widget.handle,
          'knowledgeBaseCustomText': _knowledgeBaseCustomText,
        }),
      );
      // Trigger sync
      await http.post(
        Uri.parse('$apiBase/knowledge/sync'),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({'handle': widget.handle}),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Knowledge saved & sync started'),
              backgroundColor: Color(0xFF22C55E)),
        );
      }
    } catch (_) {}
    if (mounted) setState(() => _savingKb = false);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF020617),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.displayName ?? widget.handle,
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                        ),
                        Text(
                          '@${widget.handle}',
                          style: const TextStyle(
                              color: Colors.white54, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color:
                          const Color(0xFF4F46E5).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'ADMIN',
                      style: TextStyle(
                        color: Color(0xFF4F46E5),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (_loading)
              const Expanded(
                child: Center(
                  child:
                      CircularProgressIndicator(color: Color(0xFF4F46E5)),
                ),
              )
            else
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                  children: [
                    // Credits card
                    if (_credits != null)
                      Container(
                        padding: const EdgeInsets.all(16),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                          ),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Credits remaining',
                                    style: TextStyle(
                                        color: Colors.white70, fontSize: 12),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${_credits ?? 0}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 28,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (_totalUsed != null)
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  const Text(
                                    'Total used',
                                    style: TextStyle(
                                        color: Colors.white70, fontSize: 12),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${_totalUsed ?? 0}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),

                    // Voice selector
                    _sectionLabel('Voice'),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Select the voice callers hear',
                            style:
                                TextStyle(color: Colors.white54, fontSize: 12),
                          ),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            value: _selectedVoice,
                            dropdownColor: const Color(0xFF0F172A),
                            style: const TextStyle(
                                color: Colors.white, fontSize: 13),
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: const Color(0xFF020617),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                    color: Color(0xFF1E293B)),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                    color: Color(0xFF1E293B)),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 10),
                            ),
                            items: _voices
                                .map((v) => DropdownMenuItem(
                                      value: v['id'],
                                      child: Text(v['label']!,
                                          style: const TextStyle(
                                              fontSize: 12)),
                                    ))
                                .toList(),
                            onChanged: (v) {
                              if (v != null) setState(() => _selectedVoice = v);
                            },
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _savingVoice ? null : _saveVoice,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF4F46E5),
                                foregroundColor: Colors.white,
                              ),
                              child: _savingVoice
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white),
                                    )
                                  : const Text('Save voice'),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Persona
                    _sectionLabel('Persona'),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'How the AI behaves and responds',
                            style:
                                TextStyle(color: Colors.white54, fontSize: 12),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            maxLines: 4,
                            controller: TextEditingController(text: _persona),
                            onChanged: (v) => _persona = v,
                            style: const TextStyle(
                                color: Colors.white, fontSize: 13),
                            decoration: InputDecoration(
                              hintText: 'Describe the voice agent persona...',
                              hintStyle: const TextStyle(
                                  color: Colors.white24, fontSize: 13),
                              filled: true,
                              fillColor: const Color(0xFF020617),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                    color: Color(0xFF1E293B)),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                    color: Color(0xFF1E293B)),
                              ),
                              contentPadding: const EdgeInsets.all(12),
                            ),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _savingPersona ? null : _savePersona,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF4F46E5),
                                foregroundColor: Colors.white,
                              ),
                              child: _savingPersona
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white),
                                    )
                                  : const Text('Save persona'),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Knowledge base custom text
                    _sectionLabel('Knowledge base'),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Custom knowledge (policies, FAQ, hours)',
                            style:
                                TextStyle(color: Colors.white54, fontSize: 12),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            maxLines: 6,
                            controller: TextEditingController(
                                text: _knowledgeBaseCustomText),
                            onChanged: (v) => _knowledgeBaseCustomText = v,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontFamily: 'monospace'),
                            decoration: InputDecoration(
                              hintText:
                                  'Opening hours, policies, FAQs, pricing...',
                              hintStyle: const TextStyle(
                                  color: Colors.white24, fontSize: 12),
                              filled: true,
                              fillColor: const Color(0xFF020617),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                    color: Color(0xFF1E293B)),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                    color: Color(0xFF1E293B)),
                              ),
                              contentPadding: const EdgeInsets.all(12),
                            ),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _savingKb ? null : _saveKb,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF4F46E5),
                                foregroundColor: Colors.white,
                              ),
                              child: _savingKb
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white),
                                    )
                                  : const Text('Save & sync'),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Switch back to user mode
                    OutlinedButton.icon(
                      onPressed: widget.onToggleOff,
                      icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                      label: const Text('Switch to user mode'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF4F46E5),
                        side: const BorderSide(color: Color(0xFF4F46E5)),
                        minimumSize: const Size.fromHeight(44),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text,
        style: const TextStyle(
          color: Colors.white54,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      );
}
