import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../api_config.dart';
import '../services/auth_service.dart';

class AdminWebsitePage extends StatefulWidget {
  final String handle;
  final Color themeColor;
  const AdminWebsitePage({
    super.key,
    required this.handle,
    this.themeColor = const Color(0xFF4F46E5),
  });

  @override
  State<AdminWebsitePage> createState() => _AdminWebsitePageState();
}

class _AdminWebsitePageState extends State<AdminWebsitePage> {
  final _heroController = TextEditingController();
  final _aboutController = TextEditingController();
  final _emailController = TextEditingController();
  List<String> _galleryImages = [];
  String _colorTheme = 'indigo';
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;

  static const _themes = ['indigo', 'emerald', 'rose', 'amber', 'cyan', 'violet'];
  static const _themeColors = {
    'indigo': Color(0xFF6366F1),
    'emerald': Color(0xFF10B981),
    'rose': Color(0xFFF43F5E),
    'amber': Color(0xFFF59E0B),
    'cyan': Color(0xFF06B6D4),
    'violet': Color(0xFF8B5CF6),
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _heroController.dispose();
    _aboutController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final token = await AuthService.getIdToken();
      if (token == null) return;
      final res = await http.get(
        Uri.parse(
            '$apiBase/website/config?handle=${Uri.encodeComponent(widget.handle)}'),
        headers: {'authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        // API returns config at root (no "config" wrapper)
        final config = data.containsKey('galleryImages') || data.containsKey('heroTagline')
            ? data
            : (data['config'] as Map<String, dynamic>? ?? {});
        if (mounted) {
          _heroController.text = config['heroTagline'] as String? ?? '';
          _aboutController.text = config['aboutText'] as String? ?? '';
          _emailController.text = config['contactEmail'] as String? ?? '';
          _colorTheme = config['colorTheme'] as String? ?? 'indigo';
          _galleryImages = List<String>.from(
              (config['galleryImages'] as List<dynamic>?) ?? []);
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final token = await AuthService.getIdToken();
      if (token == null) return;
      final res = await http.post(
        Uri.parse('$apiBase/website/config'),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'handle': widget.handle,
          'heroTagline': _heroController.text,
          'aboutText': _aboutController.text,
          'contactEmail': _emailController.text,
          'colorTheme': _colorTheme,
          'galleryImages': _galleryImages,
        }),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res.statusCode == 200
                ? 'Website saved'
                : 'Error saving website'),
            backgroundColor: res.statusCode == 200
                ? const Color(0xFF22C55E)
                : Colors.redAccent,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Error: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _uploadImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 1200);
    if (picked == null) return;

    setState(() => _uploading = true);
    try {
      final token = await AuthService.getIdToken();
      if (token == null) return;

      // Get presigned URL
      final presignRes = await http.post(
        Uri.parse('$apiBase/website/upload-image'),
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'handle': widget.handle,
          'fileName': picked.name,
          'contentType': 'image/jpeg',
        }),
      );
      if (presignRes.statusCode != 200) throw Exception('Failed to get upload URL');
      final presignData = jsonDecode(presignRes.body) as Map<String, dynamic>;
      final uploadUrl = presignData['uploadUrl'] as String;
      final publicUrl = presignData['publicUrl'] as String;

      // Upload to S3
      final bytes = await picked.readAsBytes();
      final uploadRes = await http.put(
        Uri.parse(uploadUrl),
        headers: {'Content-Type': 'image/jpeg'},
        body: bytes,
      );
      if (uploadRes.statusCode != 200) throw Exception('Upload failed');

      if (mounted) {
        setState(() => _galleryImages = [..._galleryImages, publicUrl]);
        await _save(); // Persist so image appears on web and after refresh
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Upload failed: $e'),
              backgroundColor: Colors.redAccent),
        );
      }
    }
    if (mounted) setState(() => _uploading = false);
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
                    child: Text(
                      'Website',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 1.5,
                                color: widget.themeColor),
                          )
                        : const Icon(Icons.save_rounded, size: 16),
                    label: const Text('Save'),
                    style: TextButton.styleFrom(
                      foregroundColor: widget.themeColor,
                    ),
                  ),
                ],
              ),
            ),
            if (_loading)
               Expanded(
                child: Center(
                  child:
                      CircularProgressIndicator(color: widget.themeColor),
                ),
              )
            else
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                  children: [
                    // URL preview
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.language_rounded,
                              color: widget.themeColor, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'callcentral.io/${widget.handle}',
                              style: TextStyle(
                                color: widget.themeColor,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Hero tagline
                    _label('Hero tagline'),
                    const SizedBox(height: 6),
                    _input(_heroController, 'Welcome to our business...'),
                    const SizedBox(height: 16),

                    // About
                    _label('About your business'),
                    const SizedBox(height: 6),
                    _textArea(_aboutController, 'Tell visitors about your business...'),
                    const SizedBox(height: 16),

                    // Contact email
                    _label('Contact email'),
                    const SizedBox(height: 6),
                    _input(_emailController, 'hello@yourbusiness.com'),
                    const SizedBox(height: 20),

                    // Color theme
                    _label('Color theme'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      children: _themes.map((t) {
                        final isSelected = _colorTheme == t;
                        return GestureDetector(
                          onTap: () => setState(() => _colorTheme = t),
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: _themeColors[t],
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isSelected
                                    ? Colors.white
                                    : Colors.transparent,
                                width: 2,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),

                    // Gallery
                    _label('Gallery photos'),
                    const SizedBox(height: 8),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                      ),
                      itemCount: _galleryImages.length + 1,
                      itemBuilder: (ctx, idx) {
                        if (idx == _galleryImages.length) {
                          // Upload button
                          return GestureDetector(
                            onTap: _uploading ? null : _uploadImage,
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: const Color(0xFF1E293B),
                                  style: BorderStyle.solid,
                                ),
                                color: const Color(0xFF0F172A),
                              ),
                              child: Center(
                                child: _uploading
                                    ? const SizedBox(
                                        width: 24,
                                        height: 24,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white38),
                                      )
                                    : const Icon(Icons.add_photo_alternate_outlined,
                                        color: Colors.white38, size: 28),
                              ),
                            ),
                          );
                        }
                        return Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.network(
                                _galleryImages[idx],
                                fit: BoxFit.cover,
                                width: double.infinity,
                                height: double.infinity,
                                errorBuilder: (_, __, ___) => Container(
                                  color: const Color(0xFF1E293B),
                                  child: const Icon(Icons.broken_image,
                                      color: Colors.white38),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 4,
                              right: 4,
                              child: GestureDetector(
                                onTap: () async {
                                  setState(() {
                                    _galleryImages = List.from(_galleryImages)
                                      ..removeAt(idx);
                                  });
                                  await _save(); // Persist removal so it reflects on web and after refresh
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(4),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.6),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close,
                                      color: Colors.white, size: 14),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Text(
        text,
        style: const TextStyle(
          color: Colors.white70,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      );

  Widget _input(TextEditingController controller, String hint) => TextField(
        controller: controller,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white24, fontSize: 14),
          filled: true,
          fillColor: const Color(0xFF0F172A),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1E293B)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1E293B)),
          ),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
      );

  Widget _textArea(TextEditingController controller, String hint) => TextField(
        controller: controller,
        maxLines: 4,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white24, fontSize: 14),
          filled: true,
          fillColor: const Color(0xFF0F172A),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1E293B)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF1E293B)),
          ),
          contentPadding: const EdgeInsets.all(14),
        ),
      );
}
