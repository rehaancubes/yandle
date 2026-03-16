import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

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

  List<DiscoveryResult> _sortedResults() {
    final list = List<DiscoveryResult>.from(_results);
    list.sort((a, b) {
      final da = a.distanceKm ?? double.infinity;
      final db = b.distanceKm ?? double.infinity;
      return da.compareTo(db);
    });
    return list;
  }

  @override
  Widget build(BuildContext context) {
    const themeColor = Color(0xFF4F46E5);
    const cardBg = Color(0xFF0F172A);
    const borderColor = Color(0xFF1E293B);
    const surface = Color(0xFF1E293B);

    return Container(
      color: const Color(0xFF020617),
      child: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                // Header: title center, filter right (ref: Local Services + filter icon)
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 12, 16, 8),
                  child: Row(
                    children: [
                      const SizedBox(width: 40),
                      const Expanded(
                        child: Text(
                          'Discover',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          // Filter sheet or category picker
                          setState(() {});
                        },
                        icon: const Icon(Icons.tune_rounded, color: Colors.white70, size: 24),
                      ),
                    ],
                  ),
                ),
                // Search bar (ref: rounded, search icon, placeholder)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Container(
                    height: 44,
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: borderColor),
                    ),
                    child: TextField(
                      controller: _queryController,
                      style: const TextStyle(color: Colors.white, fontSize: 15),
                      cursorColor: themeColor,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (s) => _runSearch(s),
                      decoration: const InputDecoration(
                        hintText: 'Search businesses...',
                        hintStyle: TextStyle(color: Colors.white38, fontSize: 15),
                        prefixIcon: Icon(Icons.search, color: Colors.white54, size: 22),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                    ),
                  ),
                ),
                // Category filters
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
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
                            color: isSelected ? Colors.white : Colors.white70,
                          ),
                        ),
                        selected: isSelected,
                        onSelected: (_) {
                          setState(() {
                            _selectedCategory = filter.category.isEmpty ? null : filter.category;
                          });
                          _runSearch(_queryController.text.trim(), category: filter.category.isEmpty ? null : filter.category);
                        },
                        backgroundColor: surface,
                        selectedColor: themeColor,
                        side: BorderSide(
                          color: isSelected ? themeColor : borderColor,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Colors.redAccent, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _error!,
                            style: const TextStyle(color: Colors.redAccent, fontSize: 13),
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
                                _isSearching ? Icons.manage_search_rounded : Icons.location_on_outlined,
                                color: Colors.white12,
                                size: 52,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                _isSearching
                                    ? 'Finding places for you…'
                                    : 'Search or turn on location to see nearby places.',
                                style: const TextStyle(color: Colors.white38, fontSize: 14),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
                          itemCount: _sortedResults().length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final r = _sortedResults()[index];
                            final baseName = r.businessName ?? r.displayName ?? r.handle;
                            final name = (r.locationName != null && r.locationName!.isNotEmpty)
                                ? '$baseName – ${r.locationName}'
                                : baseName;
                            final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
                            final imageUrl = r.imageUrl;
                            return Material(
                              color: cardBg,
                              borderRadius: BorderRadius.circular(14),
                              clipBehavior: Clip.antiAlias,
                              child: InkWell(
                                onTap: () => _openBusinessDetails(r),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(color: borderColor),
                                  ),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(10),
                                        child: imageUrl != null && imageUrl.isNotEmpty
                                            ? Image.network(
                                                imageUrl,
                                                width: 88,
                                                height: 88,
                                                fit: BoxFit.cover,
                                                loadingBuilder: (_, child, progress) {
                                                  if (progress == null) return child;
                                                  return Container(
                                                    width: 88,
                                                    height: 88,
                                                    color: surface,
                                                    child: const Center(
                                                      child: SizedBox(
                                                        width: 24,
                                                        height: 24,
                                                        child: CircularProgressIndicator(strokeWidth: 2, color: themeColor),
                                                      ),
                                                    ),
                                                  );
                                                },
                                                errorBuilder: (_, __, ___) => Container(
                                                  width: 88,
                                                  height: 88,
                                                  decoration: BoxDecoration(
                                                    color: themeColor.withValues(alpha: 0.15),
                                                    borderRadius: BorderRadius.circular(10),
                                                  ),
                                                  child: Center(
                                                    child: Text(
                                                      initial,
                                                      style: const TextStyle(
                                                        color: themeColor,
                                                        fontWeight: FontWeight.bold,
                                                        fontSize: 22,
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              )
                                            : Container(
                                                width: 88,
                                                height: 88,
                                                decoration: BoxDecoration(
                                                  color: themeColor.withValues(alpha: 0.15),
                                                  borderRadius: BorderRadius.circular(10),
                                                ),
                                                child: Center(
                                                  child: Text(
                                                    initial,
                                                    style: const TextStyle(
                                                      color: themeColor,
                                                      fontWeight: FontWeight.bold,
                                                      fontSize: 22,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    name,
                                                    style: const TextStyle(
                                                      fontWeight: FontWeight.w600,
                                                      color: Colors.white,
                                                      fontSize: 15,
                                                    ),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                ),
                                                IconButton(
                                                  padding: EdgeInsets.zero,
                                                  constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                                                  icon: const Icon(Icons.favorite_border_rounded, color: Colors.white38, size: 20),
                                                  onPressed: () {},
                                                ),
                                              ],
                                            ),
                                            if (r.distanceKm != null) ...[
                                              const SizedBox(height: 4),
                                              Row(
                                                children: [
                                                  const Icon(Icons.place_outlined, color: Colors.white38, size: 14),
                                                  const SizedBox(width: 4),
                                                  Text(
                                                    '${r.distanceKm!.toStringAsFixed(1)} km away',
                                                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                                                  ),
                                                ],
                                              ),
                                            ],
                                            const SizedBox(height: 6),
                                            Row(
                                              children: [
                                                if (r.category != null && r.category!.isNotEmpty)
                                                  Text(
                                                    r.category!,
                                                    style: const TextStyle(color: themeColor, fontSize: 12, fontWeight: FontWeight.w600),
                                                  ),
                                                const Spacer(),
                                                Text(
                                                  'Book',
                                                  style: const TextStyle(color: themeColor, fontSize: 13, fontWeight: FontWeight.w600),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
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
      imageUrl: (json['imageUrl'] as String?) ??
          ((json['galleryImages'] is List && (json['galleryImages'] as List).isNotEmpty)
              ? (json['galleryImages'] as List).first as String?
              : null),
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
