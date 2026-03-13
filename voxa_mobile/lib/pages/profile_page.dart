import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api_config.dart';
import '../services/auth_service.dart';
import 'auth_page.dart';

typedef AdminToggleCallback = void Function({
  required String handle,
  String? displayName,
  String? useCase,
});

class ProfilePage extends StatefulWidget {
  final AdminToggleCallback? onAdminToggle;

  const ProfilePage({super.key, this.onAdminToggle});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  String? _email;
  List<_Handle> _handles = [];
  bool _loading = true;
  bool _signingOut = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _email = await AuthService.getCurrentUserEmail();
      final token = await AuthService.getIdToken();
      if (token != null) {
        final res = await http.get(
          Uri.parse('$apiBase/handles'),
          headers: {'authorization': 'Bearer $token'},
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body) as Map<String, dynamic>;
          final list = (data['handles'] as List<dynamic>? ?? [])
              .map((e) => _Handle.fromJson(e as Map<String, dynamic>))
              .toList();
          if (mounted) setState(() => _handles = list);
        }
      }
    } catch (_) {
      // Email from JWT is always available; handles failure is non-critical
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    await AuthService.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => const AuthPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: const Color(0xFF020617),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'Profile',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
            if (_loading)
              const Expanded(
                child: Center(
                  child: CircularProgressIndicator(color: Color(0xFF4F46E5)),
                ),
              )
            else
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                  children: [
                    // ── Account card ──────────────────────────────────────
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                colors: [Color(0xFF4F46E5), Color(0xFF22C55E)],
                              ),
                            ),
                            child: Center(
                              child: Text(
                                (_email?.isNotEmpty == true
                                    ? _email![0].toUpperCase()
                                    : '?'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 18,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _email ?? '—',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                const Text(
                                  'Yandle account',
                                  style: TextStyle(
                                      color: Colors.white54, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // ── Admin mode toggle ──────────────────────────────────
                    if (_handles.isNotEmpty && widget.onAdminToggle != null) ...[
                      Text(
                        'Admin Mode',
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: Colors.white54,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: const Color(0xFF4F46E5).withValues(alpha: 0.3),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Switch to admin mode to manage your business — bookings, conversations, customers, website, and voice settings.',
                              style: TextStyle(
                                color: Colors.white54,
                                fontSize: 12,
                                height: 1.4,
                              ),
                            ),
                            const SizedBox(height: 12),
                            ..._handles.map((h) => Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Material(
                                    color: Colors.transparent,
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(10),
                                      onTap: () {
                                        widget.onAdminToggle?.call(
                                          handle: h.handle,
                                          displayName: h.displayName,
                                          useCase: h.useCase,
                                        );
                                      },
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12, vertical: 10),
                                        decoration: BoxDecoration(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          border: Border.all(
                                            color: const Color(0xFF1E293B),
                                          ),
                                        ),
                                        child: Row(
                                          children: [
                                            Container(
                                              width: 32,
                                              height: 32,
                                              decoration: BoxDecoration(
                                                color: const Color(0xFF4F46E5)
                                                    .withValues(alpha: 0.15),
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              ),
                                              child: const Icon(
                                                Icons.storefront_outlined,
                                                color: Color(0xFF4F46E5),
                                                size: 16,
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    h.displayName ?? h.handle,
                                                    style: const TextStyle(
                                                      color: Colors.white,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                      fontSize: 13,
                                                    ),
                                                  ),
                                                  Text(
                                                    '@${h.handle}',
                                                    style: const TextStyle(
                                                      color: Colors.white54,
                                                      fontSize: 11,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            const Icon(
                                              Icons.admin_panel_settings_rounded,
                                              color: Color(0xFF4F46E5),
                                              size: 20,
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                )),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],

                    // ── Sign out ──────────────────────────────────────────
                    OutlinedButton.icon(
                      onPressed: _signingOut ? null : _signOut,
                      icon: _signingOut
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 1.5,
                                color: Colors.redAccent,
                              ),
                            )
                          : const Icon(Icons.logout, size: 16),
                      label: const Text('Sign out'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.redAccent,
                        side: const BorderSide(color: Colors.redAccent),
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
}

class _Handle {
  final String handle;
  final String? displayName;
  final String? useCase;
  final String role;

  const _Handle({
    required this.handle,
    this.displayName,
    this.useCase,
    required this.role,
  });

  factory _Handle.fromJson(Map<String, dynamic> json) => _Handle(
        handle: json['handle'] as String? ?? '',
        displayName: json['displayName'] as String?,
        useCase: json['useCase'] as String?,
        role: json['role'] as String? ?? 'manager',
      );
}
