import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../api_config.dart';
import 'business_detail_page.dart';

class DiscoverPage extends StatefulWidget {
  const DiscoverPage({super.key});

  @override
  State<DiscoverPage> createState() => _DiscoverPageState();
}

/// Business type filter for discover (matches backend useCaseId / category).
class _DiscoverFilter {
  const _DiscoverFilter({required this.label, required this.category});
  final String label;
  final String category;
}

class _DiscoverPageState extends State<DiscoverPage> {
  final TextEditingController _queryController = TextEditingController();
  bool _isSearching = false;
  String? _error;
  List<DiscoveryResult> _results = [];
  Position? _position;
  String? _selectedCategory;

  static const List<_DiscoverFilter> _filters = [
    _DiscoverFilter(label: 'All', category: ''),
    _DiscoverFilter(label: 'Gaming Cafe', category: 'gaming_cafe'),
    _DiscoverFilter(label: 'Salon', category: 'salon'),
    _DiscoverFilter(label: 'Clinic', category: 'clinic'),
    _DiscoverFilter(label: 'General', category: 'general'),
    _DiscoverFilter(label: 'Customer Support', category: 'customer_support'),
  ];

  @override
  void initState() {
    super.initState();
    _tryGetLocation();
  }

  Future<void> _tryGetLocation() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) return;
      final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      if (mounted) {
        setState(() => _position = pos);
        _loadNearby();
      }
    } catch (_) {
      // Location unavailable — search works without it
    }
  }

  /// Load nearby places when we have location (no text query).
  Future<void> _loadNearby() async {
    if (_position == null || _isSearching) return;
    setState(() {
      _isSearching = true;
      _error = null;
    });
    try {
      final params = <String, String>{
        'q': '',
        'lat': _position!.latitude.toString(),
        'lng': _position!.longitude.toString(),
      };
      if (_selectedCategory != null && _selectedCategory!.isNotEmpty) {
        params['category'] = _selectedCategory!;
      }
      final uri =
          Uri.parse('$apiBase/discover').replace(queryParameters: params);
      final resp = await http.get(uri);
      if (!mounted) return;
      if (resp.statusCode != 200) {
        setState(() => _error = 'Search failed (${resp.statusCode}).');
        return;
      }
      final decoded = json.decode(resp.body) as Map<String, dynamic>;
      final list = (decoded['results'] as List<dynamic>? ?? [])
          .map(
            (e) => DiscoveryResult.fromJson(e as Map<String, dynamic>),
          )
          .toList();
      setState(() => _results = list);
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Could not reach Yandle. Check network/API base URL.');
      }
    } finally {
      if (mounted) setState(() => _isSearching = false);
    }
  }

  Future<void> _runSearch(String query, {String? category}) async {
    if (_isSearching) return;
    final useCategory = category ?? _selectedCategory;
    final trimmed = query.trim();

    setState(() {
      _isSearching = true;
      _error = null;
      if (trimmed.isEmpty && useCategory == null && _position == null) {
        _results = [];
      }
    });

    try {
      final params = <String, String>{};
      if (trimmed.isNotEmpty) params['q'] = trimmed;
      if (_position != null) {
        params['lat'] = _position!.latitude.toString();
        params['lng'] = _position!.longitude.toString();
      }
      if (useCategory != null && useCategory.isNotEmpty) {
        params['category'] = useCategory;
      }
      if (!params.containsKey('q')) params['q'] = '';
      if (trimmed.isEmpty && _position == null && (useCategory == null || useCategory.isEmpty)) {
        setState(() => _isSearching = false);
        return;
      }

      final uri =
          Uri.parse('$apiBase/discover').replace(queryParameters: params);
      final resp = await http.get(uri);
      if (!mounted) return;
      if (resp.statusCode != 200) {
        setState(() => _error = 'Search failed (${resp.statusCode}).');
        return;
      }

      final decoded = json.decode(resp.body) as Map<String, dynamic>;
      final list = (decoded['results'] as List<dynamic>? ?? [])
          .map(
            (e) => DiscoveryResult.fromJson(e as Map<String, dynamic>),
          )
          .toList();

      setState(() => _results = list);
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Could not reach Yandle. Check network/API base URL.');
      }
    } finally {
      if (mounted) {
        setState(() => _isSearching = false);
      }
    }
  }

  Future<void> _callBusiness(DiscoveryResult r) async {
    final phone = r.phoneNumber;
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Widget _listPlaceholder(String initial) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: const Color(0xFF4F46E5).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Center(
        child: Text(
          initial,
          style: const TextStyle(
            color: Color(0xFF4F46E5),
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
      ),
    );
  }

  void _openBusinessDetails(DiscoveryResult r) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BusinessDetailPage(
          handle: r.handle,
          displayName: r.displayName,
          businessName: r.businessName,
          address: r.address,
          city: r.city,
          phoneNumber: r.phoneNumber,
          hasAiPhone: r.hasAiPhone ?? false,
          hasWalkInSlots: r.realtimeAvailability?.hasWalkInSlots ?? false,
          supportsUrgentCases:
              r.realtimeAvailability?.supportsUrgentCases ?? false,
          locationId: r.locationId,
          branchId: r.branchId,
          centerId: r.centerId,
          locationName: r.locationName,
          initialImageUrl: r.imageUrl,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF020617), Color(0xFF020617)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Discover nearby',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Search or pick a type to find businesses. Nearby places show when location is on.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFF1E293B)),
                      color: const Color(0xFF020617),
                    ),
                    child: Row(
                      children: [
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Icon(
                            Icons.search,
                            color: Colors.white60,
                          ),
                        ),
                        Expanded(
                          child: TextField(
                            controller: _queryController,
                            style: const TextStyle(color: Colors.white),
                            cursorColor: Colors.white70,
                            textInputAction: TextInputAction.search,
                            onSubmitted: (s) => _runSearch(s),
                            decoration: const InputDecoration(
                              hintText: 'Search by name or keyword',
                              hintStyle: TextStyle(color: Colors.white38),
                              border: InputBorder.none,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: FilledButton(
                            onPressed: _isSearching
                                ? null
                                : () => _runSearch(_queryController.text.trim()),
                            style: FilledButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 14),
                              backgroundColor: const Color(0xFF4F46E5),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                            child: _isSearching
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor:
                                          AlwaysStoppedAnimation(Colors.white),
                                    ),
                                  )
                                : const Text('Search'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 36,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _filters.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final filter = _filters[index];
                        final isSelected = _selectedCategory == filter.category;
                        return FilterChip(
                          label: Text(
                            filter.label,
                            style: TextStyle(
                                fontSize: 12,
                                color: isSelected
                                    ? Colors.white
                                    : Colors.white70),
                          ),
                          selected: isSelected,
                          onSelected: (_) {
                            setState(() => _selectedCategory =
                                filter.category.isEmpty ? null : filter.category);
                            _runSearch(_queryController.text.trim(),
                                category: filter.category.isEmpty
                                    ? null
                                    : filter.category);
                          },
                          backgroundColor: const Color(0xFF020617),
                          selectedColor: const Color(0xFF4F46E5),
                          side: BorderSide(
                            color: isSelected
                                ? const Color(0xFF4F46E5)
                                : const Color(0xFF1E293B),
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.redAccent, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _error!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.redAccent,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: _results.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _isSearching
                                ? Icons.manage_search_rounded
                                : Icons.location_on_outlined,
                            color: Colors.white12,
                            size: 52,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _isSearching
                                ? 'Finding places for you…'
                                : 'Search or tap a type above. Turn on location to see nearby places.',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: Colors.white38),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: _results.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final r = _results[index];
                        final baseName =
                            r.businessName ?? r.displayName ?? r.handle;
                        final name = (r.locationName != null &&
                                r.locationName!.isNotEmpty)
                            ? '$baseName – ${r.locationName}'
                            : baseName;
                        final initial =
                            name.isNotEmpty ? name[0].toUpperCase() : '?';
                        return Material(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(16),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => _openBusinessDetails(r),
                            child: Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                    color: const Color(0xFF1E293B)),
                              ),
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: r.imageUrl != null &&
                                                r.imageUrl!.isNotEmpty
                                            ? Image.network(
                                                r.imageUrl!,
                                                width: 56,
                                                height: 56,
                                                fit: BoxFit.cover,
                                                loadingBuilder: (_, child, progress) {
                                                  if (progress == null) return child;
                                                  return Container(
                                                    width: 56,
                                                    height: 56,
                                                    color: const Color(0xFF1E293B),
                                                    child: const Center(
                                                      child: SizedBox(
                                                        width: 20,
                                                        height: 20,
                                                        child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF4F46E5)),
                                                      ),
                                                    ),
                                                  );
                                                },
                                                errorBuilder: (_, __, ___) =>
                                                    _listPlaceholder(initial),
                                              )
                                            : _listPlaceholder(initial),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    name,
                                                    style: const TextStyle(
                                                      fontWeight:
                                                          FontWeight.w600,
                                                      color: Colors.white,
                                                      fontSize: 15,
                                                    ),
                                                  ),
                                                ),
                                                if (r.distanceKm != null)
                                                  Text(
                                                    '${r.distanceKm!.toStringAsFixed(1)} km',
                                                    style: const TextStyle(
                                                        color: Colors.white38,
                                                        fontSize: 11),
                                                  ),
                                              ],
                                            ),
                                            if (r.category != null &&
                                                r.category!.isNotEmpty)
                                              Padding(
                                                padding:
                                                    const EdgeInsets.only(
                                                        top: 2),
                                                child: Text(
                                                  r.category!,
                                                  style: const TextStyle(
                                                    color:
                                                        Color(0xFF4F46E5),
                                                    fontSize: 12,
                                                    fontWeight:
                                                        FontWeight.w500,
                                                  ),
                                                ),
                                              ),
                                            if (r.address != null &&
                                                r.address!.isNotEmpty)
                                              Padding(
                                                padding:
                                                    const EdgeInsets.only(
                                                        top: 3),
                                                child: Row(
                                                  children: [
                                                    const Icon(
                                                        Icons.place_outlined,
                                                        color:
                                                            Colors.white38,
                                                        size: 12),
                                                    const SizedBox(width: 3),
                                                    Expanded(
                                                      child: Text(
                                                        [
                                                          r.address,
                                                          if (r.city !=
                                                                  null &&
                                                              r.city!
                                                                  .isNotEmpty)
                                                            r.city
                                                        ].join(', '),
                                                        style:
                                                            const TextStyle(
                                                          color:
                                                              Colors.white54,
                                                          fontSize: 12,
                                                        ),
                                                        maxLines: 1,
                                                        overflow: TextOverflow
                                                            .ellipsis,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (r.realtimeAvailability
                                              ?.hasWalkInSlots ==
                                          true ||
                                      r.realtimeAvailability
                                              ?.supportsUrgentCases ==
                                          true ||
                                      r.hasAiPhone == true) ...[
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 6,
                                      runSpacing: 4,
                                      children: [
                                        if (r.realtimeAvailability
                                                ?.hasWalkInSlots ==
                                            true)
                                          const _AvailabilityPill(
                                            label: 'Walk-ins welcome',
                                            color: Color(0xFF22C55E),
                                          ),
                                        if (r.realtimeAvailability
                                                ?.supportsUrgentCases ==
                                            true)
                                          const _AvailabilityPill(
                                            label: 'Urgent / late-night',
                                            color: Color(0xFFF97316),
                                          ),
                                        if (r.hasAiPhone == true)
                                          const _AvailabilityPill(
                                            label: 'AI phone',
                                            color: Color(0xFF4F46E5),
                                          ),
                                      ],
                                    ),
                                  ],
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: FilledButton.icon(
                                          onPressed: () =>
                                              _openBusinessDetails(r),
                                          icon: const Icon(
                                              Icons.calendar_today, size: 15),
                                          label: const Text('Book'),
                                          style: FilledButton.styleFrom(
                                            backgroundColor:
                                                const Color(0xFF4F46E5),
                                            padding: const EdgeInsets
                                                .symmetric(
                                                    horizontal: 14,
                                                    vertical: 8),
                                            textStyle: const TextStyle(
                                                fontSize: 13,
                                                fontWeight:
                                                    FontWeight.w600),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      OutlinedButton.icon(
                                        onPressed: () =>
                                            _openBusinessDetails(r),
                                        icon: const Icon(
                                            Icons.chat_bubble_outline,
                                            size: 15),
                                        label: const Text('Text'),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor:
                                              const Color(0xFF4F46E5),
                                          side: const BorderSide(
                                              color: Color(0xFF4F46E5)),
                                          padding: const EdgeInsets
                                              .symmetric(
                                                  horizontal: 12,
                                                  vertical: 8),
                                          textStyle: const TextStyle(
                                              fontSize: 13,
                                              fontWeight:
                                                  FontWeight.w500),
                                        ),
                                      ),
                                      if (r.phoneNumber != null &&
                                          r.phoneNumber!.isNotEmpty) ...[
                                        const SizedBox(width: 8),
                                        IconButton(
                                          onPressed: () => _callBusiness(r),
                                          icon: const Icon(Icons.call,
                                              size: 20,
                                              color: Color(0xFF4F46E5)),
                                        ),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class DiscoveryResult {
  DiscoveryResult({
    required this.handle,
    this.displayName,
    this.businessName,
    this.category,
    this.address,
    this.city,
    this.phoneNumber,
    this.hasAiPhone,
    this.hasWidget,
    this.distanceKm,
    this.realtimeAvailability,
    this.locationId,
    this.branchId,
    this.centerId,
    this.locationName,
    this.imageUrl,
  });

  final String handle;
  final String? displayName;
  final String? businessName;
  final String? category;
  final String? address;
  final String? city;
  final String? phoneNumber;
  final bool? hasAiPhone;
  final bool? hasWidget;
  final double? distanceKm;
  final RealtimeAvailability? realtimeAvailability;
  final String? locationId;
  final String? branchId;
  final String? centerId;
  final String? locationName;
  /// First gallery image URL from business website (for list/detail)
  final String? imageUrl;

  factory DiscoveryResult.fromJson(Map<String, dynamic> json) {
    return DiscoveryResult(
      handle: json['handle'] as String,
      displayName: json['displayName'] as String?,
      businessName: json['businessName'] as String?,
      category: json['category'] as String?,
      address: json['address'] as String?,
      city: json['city'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      hasAiPhone: json['hasAiPhone'] as bool?,
      hasWidget: json['hasWidget'] as bool?,
      distanceKm: (json['distanceKm'] is num)
          ? (json['distanceKm'] as num).toDouble()
          : null,
      realtimeAvailability: json['realtimeAvailability'] is Map<String, dynamic>
          ? RealtimeAvailability.fromJson(
              json['realtimeAvailability'] as Map<String, dynamic>,
            )
          : null,
      locationId: json['locationId'] as String?,
      branchId: json['branchId'] as String?,
      centerId: json['centerId'] as String?,
      locationName: json['locationName'] as String?,
      imageUrl: json['imageUrl'] as String?,
    );
  }
}

class RealtimeAvailability {
  RealtimeAvailability({
    this.hasWalkInSlots,
    this.supportsUrgentCases,
  });

  final bool? hasWalkInSlots;
  final bool? supportsUrgentCases;

  factory RealtimeAvailability.fromJson(Map<String, dynamic> json) {
    return RealtimeAvailability(
      hasWalkInSlots: json['hasWalkInSlots'] as bool?,
      supportsUrgentCases: json['supportsUrgentCases'] as bool?,
    );
  }
}

class _AvailabilityPill extends StatelessWidget {
  const _AvailabilityPill({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: color,
                ),
          ),
        ],
      ),
    );
  }
}

