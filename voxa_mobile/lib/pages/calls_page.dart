import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api_config.dart';
import '../services/auth_service.dart';
import 'business_detail_page.dart';

class CallsPage extends StatefulWidget {
  const CallsPage({super.key});

  @override
  State<CallsPage> createState() => _CallsPageState();
}

class _CallsPageState extends State<CallsPage> {
  // ── Search ────────────────────────────────────────────────────────────────
  final TextEditingController _searchCtrl = TextEditingController();
  List<_BizResult> _searchResults = [];
  bool _searching = false;
  bool _hasSearched = false;
  Timer? _debounce;

  // ── Recent (from bookings) ────────────────────────────────────────────────
  List<_BizResult> _recent = [];
  bool _recentLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRecent();
    _searchCtrl.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.removeListener(_onSearchChanged);
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  Future<void> _loadRecent() async {
    try {
      final token = await AuthService.getIdToken();
      final res = await http.get(
        Uri.parse('$apiBase/my-bookings?limit=50&includeAll=true'),
        headers: {if (token != null) 'authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final bookings = (data['bookings'] as List<dynamic>? ?? []);
        final seen = <String>{};
        final results = <_BizResult>[];
        for (final e in bookings) {
          final m = e as Map<String, dynamic>;
          final handle = m['handle'] as String? ?? '';
          if (handle.isEmpty || seen.contains(handle)) continue;
          seen.add(handle);
          final biz = (m['business'] as Map<String, dynamic>?) ?? {};
          results.add(_BizResult(
            handle: handle,
            displayName: biz['displayName'] as String?,
            businessName: biz['businessName'] as String?,
            address: biz['address'] as String?,
            phoneNumber: biz['phoneNumber'] as String?,
            hasAiPhone: (biz['hasAiPhone'] as bool?) ?? false,
          ));
        }
        if (mounted) setState(() => _recent = results);
      }
    } catch (_) {
      // Non-critical — page still works without recent list
    } finally {
      if (mounted) setState(() => _recentLoading = false);
    }
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    final q = _searchCtrl.text.trim();
    if (q.isEmpty) {
      setState(() {
        _searchResults = [];
        _hasSearched = false;
        _searching = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _runSearch(q));
  }

  Future<void> _runSearch(String q) async {
    setState(() => _searching = true);
    try {
      final uri = Uri.parse('$apiBase/discover')
          .replace(queryParameters: {'q': q, 'limit': '20'});
      final res = await http.get(uri);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (data['results'] as List<dynamic>? ?? [])
            .map((e) => _BizResult.fromDiscover(e as Map<String, dynamic>))
            .toList();
        if (mounted) {
          setState(() {
            _searchResults = list;
            _hasSearched = true;
          });
        }
      }
    } catch (_) {
      // ignore
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _openBusiness(_BizResult b) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BusinessDetailPage(
          handle: b.handle,
          displayName: b.displayName,
          businessName: b.businessName,
          address: b.address,
          phoneNumber: b.phoneNumber,
          hasAiPhone: b.hasAiPhone,
        ),
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final showSearch = _searchCtrl.text.trim().isNotEmpty;

    return Container(
      color: const Color(0xFF020617),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF4F46E5).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.spatial_audio_off_rounded,
                      color: Color(0xFF4F46E5),
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'AI Calls',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),

            // Search bar
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: TextField(
                  controller: _searchCtrl,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Search businesses to call…',
                    hintStyle: const TextStyle(color: Colors.white38),
                    prefixIcon: _searching
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 1.5,
                                color: Color(0xFF4F46E5),
                              ),
                            ),
                          )
                        : const Icon(Icons.search,
                            color: Colors.white38, size: 20),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.close,
                                color: Colors.white38, size: 18),
                            onPressed: () {
                              _searchCtrl.clear();
                              FocusScope.of(context).unfocus();
                            },
                          )
                        : null,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                  ),
                ),
              ),
            ),

            // Body
            Expanded(
              child: showSearch
                  ? _buildSearchResults(theme)
                  : _buildRecent(theme),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchResults(ThemeData theme) {
    if (!_hasSearched && !_searching) {
      return const SizedBox.shrink();
    }
    if (_searchResults.isEmpty && !_searching) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, color: Colors.white24, size: 40),
            const SizedBox(height: 12),
            Text('No results found.',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: Colors.white54)),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      itemCount: _searchResults.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _BizCard(
        biz: _searchResults[i],
        onTap: () => _openBusiness(_searchResults[i]),
      ),
    );
  }

  Widget _buildRecent(ThemeData theme) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        // Call prompt card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                const Color(0xFF4F46E5).withValues(alpha: 0.2),
                const Color(0xFF22C55E).withValues(alpha: 0.1),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: const Color(0xFF4F46E5).withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.mic_none_rounded,
                  color: Color(0xFF4F46E5), size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Talk to any business AI',
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Search for a business above and tap to start a live voice or chat session.',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: Colors.white54),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Recent businesses
        if (_recentLoading) ...[
          const SizedBox(height: 24),
          const Center(
            child: CircularProgressIndicator(color: Color(0xFF4F46E5)),
          ),
        ] else if (_recent.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            'Recent',
            style: theme.textTheme.labelLarge?.copyWith(
              color: Colors.white54,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          ..._recent.map((b) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _BizCard(
                  biz: b,
                  onTap: () => _openBusiness(b),
                ),
              )),
        ],
      ],
    );
  }
}

// ─── Business card ────────────────────────────────────────────────────────────

class _BizCard extends StatelessWidget {
  final _BizResult biz;
  final VoidCallback onTap;

  const _BizCard({required this.biz, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = biz.businessName ?? biz.displayName ?? biz.handle;
    return Material(
      color: const Color(0xFF0F172A),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFF1E293B)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF4F46E5).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: const TextStyle(
                      color: Color(0xFF4F46E5),
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
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
                      name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (biz.address != null)
                      Text(
                        biz.address!,
                        style: const TextStyle(
                            color: Colors.white54, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF4F46E5).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.mic_none_rounded,
                        color: Color(0xFF4F46E5), size: 14),
                    SizedBox(width: 4),
                    Text(
                      'Call',
                      style: TextStyle(
                        color: Color(0xFF4F46E5),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Model ────────────────────────────────────────────────────────────────────

class _BizResult {
  final String handle;
  final String? displayName;
  final String? businessName;
  final String? address;
  final String? phoneNumber;
  final bool hasAiPhone;

  const _BizResult({
    required this.handle,
    this.displayName,
    this.businessName,
    this.address,
    this.phoneNumber,
    this.hasAiPhone = false,
  });

  factory _BizResult.fromDiscover(Map<String, dynamic> json) => _BizResult(
        handle: json['handle'] as String? ?? '',
        displayName: json['displayName'] as String?,
        businessName: json['businessName'] as String?,
        address: json['address'] as String?,
        phoneNumber: json['phoneNumber'] as String?,
        hasAiPhone: (json['hasAiPhone'] as bool?) ?? false,
      );
}
