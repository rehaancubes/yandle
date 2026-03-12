import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api_config.dart';
import '../services/auth_service.dart';
import 'business_detail_page.dart';

class BookingsPage extends StatefulWidget {
  const BookingsPage({super.key});

  @override
  State<BookingsPage> createState() => _BookingsPageState();
}

class _BookingsPageState extends State<BookingsPage> {
  List<_Booking> _bookings = [];
  bool _loading = true;
  String? _error;
  final Set<String> _cancelling = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = await AuthService.getIdToken();
      final res = await http.get(
        Uri.parse('$apiBase/my-bookings?limit=50'),
        headers: {
          if (token != null) 'authorization': 'Bearer $token',
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (data['bookings'] as List<dynamic>? ?? [])
            .map((e) => _Booking.fromJson(e as Map<String, dynamic>))
            .toList();
        if (mounted) setState(() => _bookings = list);
      } else {
        if (mounted) setState(() => _error = 'Could not load bookings.');
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Network error.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancel(_Booking b) async {
    final key = '${b.handle}|${b.startTime}';
    setState(() => _cancelling.add(key));
    try {
      final token = await AuthService.getIdToken();
      final res = await http.delete(
        Uri.parse(
            '$apiBase/bookings?handle=${Uri.encodeComponent(b.handle)}&startTime=${Uri.encodeComponent(b.startTime)}'),
        headers: {
          if (token != null) 'authorization': 'Bearer $token',
        },
      );
      if (res.statusCode == 200 || res.statusCode == 404) {
        if (mounted) {
          setState(() => _bookings.remove(b));
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Booking cancelled.'),
              backgroundColor: Color(0xFF4F46E5),
            ),
          );
        }
      } else {
        _showError('Could not cancel. Try again.');
      }
    } catch (_) {
      _showError('Network error.');
    } finally {
      if (mounted) setState(() => _cancelling.remove(key));
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.redAccent),
    );
  }

  void _rebook(_Booking b) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BusinessDetailPage(
          handle: b.handle,
          displayName: b.businessDisplayName,
          businessName: b.businessName,
          address: b.businessAddress,
          phoneNumber: b.businessPhone,
          hasAiPhone: false,
          hasWalkInSlots: false,
          supportsUrgentCases: false,
        ),
      ),
    );
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
      final m = dt.minute.toString().padLeft(2, '0');
      final ampm = dt.hour < 12 ? 'AM' : 'PM';
      return '${months[dt.month - 1]} ${dt.day}, $h:$m $ampm';
    } catch (_) {
      return iso;
    }
  }

  bool _isUpcoming(String startTime) {
    try {
      return DateTime.parse(startTime).isAfter(DateTime.now());
    } catch (_) {
      return false;
    }
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
              child: Row(
                children: [
                  Text(
                    'My Bookings',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Spacer(),
                  if (!_loading)
                    IconButton(
                      icon: const Icon(Icons.refresh, color: Colors.white54),
                      onPressed: _load,
                    ),
                ],
              ),
            ),
            if (_loading)
              const Expanded(
                child: Center(
                  child: CircularProgressIndicator(color: Color(0xFF4F46E5)),
                ),
              )
            else if (_error != null)
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline,
                          color: Colors.redAccent, size: 36),
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: const TextStyle(color: Colors.white54)),
                      const SizedBox(height: 16),
                      TextButton(
                          onPressed: _load,
                          child: const Text('Retry')),
                    ],
                  ),
                ),
              )
            else if (_bookings.isEmpty)
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.event_note_outlined,
                          color: Colors.white24, size: 48),
                      const SizedBox(height: 12),
                      Text(
                        'No upcoming bookings.',
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: Colors.white54),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Discover a business to book.',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: Colors.white38),
                      ),
                    ],
                  ),
                ),
              )
            else
              Expanded(
                child: _buildSectionedList(theme),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionedList(ThemeData theme) {
    final upcoming = _bookings.where((b) => _isUpcoming(b.startTime)).toList();
    final past = _bookings.where((b) => !_isUpcoming(b.startTime)).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        if (upcoming.isNotEmpty) ...[
          _buildSectionHeader(
            label: 'Upcoming',
            count: upcoming.length,
            color: const Color(0xFF4F46E5),
            icon: Icons.event_available_outlined,
          ),
          const SizedBox(height: 10),
          for (int i = 0; i < upcoming.length; i++) ...[
            _buildBookingCard(theme, upcoming[i], isUpcoming: true),
            if (i < upcoming.length - 1) const SizedBox(height: 10),
          ],
        ],
        if (upcoming.isNotEmpty && past.isNotEmpty) ...[
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 1,
                  color: const Color(0xFF1E293B),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Icon(
                  Icons.history,
                  size: 14,
                  color: Colors.white.withValues(alpha: 0.15),
                ),
              ),
              Expanded(
                child: Container(
                  height: 1,
                  color: const Color(0xFF1E293B),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
        ],
        if (past.isNotEmpty) ...[
          _buildSectionHeader(
            label: 'Past',
            count: past.length,
            color: Colors.white38,
            icon: Icons.history,
          ),
          const SizedBox(height: 10),
          for (int i = 0; i < past.length; i++) ...[
            _buildBookingCard(theme, past[i], isUpcoming: false),
            if (i < past.length - 1) const SizedBox(height: 10),
          ],
        ],
      ],
    );
  }

  Widget _buildSectionHeader({
    required String label,
    required int count,
    required Color color,
    required IconData icon,
  }) {
    return Row(
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: 15,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text(
            '$count',
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBookingCard(ThemeData theme, _Booking b,
      {required bool isUpcoming}) {
    final cancelKey = '${b.handle}|${b.startTime}';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isUpcoming
              ? const Color(0xFF4F46E5).withValues(alpha: 0.4)
              : const Color(0xFF1E293B),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  b.businessName ?? b.businessDisplayName ?? b.handle,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isUpcoming
                      ? const Color(0xFF4F46E5).withValues(alpha: 0.15)
                      : Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  isUpcoming ? 'Upcoming' : 'Past',
                  style: TextStyle(
                    color: isUpcoming
                        ? const Color(0xFF4F46E5)
                        : Colors.white38,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          if (b.businessAddress != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                b.businessAddress!,
                style:
                    const TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.schedule, color: Colors.white38, size: 14),
              const SizedBox(width: 4),
              Text(
                _formatTime(b.startTime),
                style: const TextStyle(
                    color: Colors.white70, fontSize: 13),
              ),
              if (b.durationMinutes != null) ...[
                const Text(' · ',
                    style: TextStyle(color: Colors.white38)),
                Text(
                  '${b.durationMinutes} min',
                  style: const TextStyle(
                      color: Colors.white38, fontSize: 12),
                ),
              ],
            ],
          ),
          if (b.notes != null && b.notes!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                b.notes!,
                style: const TextStyle(
                    color: Colors.white38, fontSize: 12),
              ),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (!isUpcoming)
                OutlinedButton.icon(
                  onPressed: () => _rebook(b),
                  icon: const Icon(Icons.refresh, size: 14),
                  label: const Text('Book again'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF4F46E5),
                    side: const BorderSide(color: Color(0xFF4F46E5)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                )
              else
                OutlinedButton.icon(
                  onPressed: _cancelling.contains(cancelKey)
                      ? null
                      : () => _confirmCancel(b),
                  icon: _cancelling.contains(cancelKey)
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 1.5,
                            color: Colors.redAccent,
                          ),
                        )
                      : const Icon(Icons.cancel_outlined, size: 14),
                  label: const Text('Cancel'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.redAccent,
                    side: const BorderSide(color: Colors.redAccent),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _confirmCancel(_Booking b) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Cancel booking?',
            style: TextStyle(color: Colors.white)),
        content: Text(
          'Cancel your booking at ${b.businessName ?? b.handle} on ${_formatTime(b.startTime)}?',
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep it'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel',
                style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
    if (confirmed == true) _cancel(b);
  }
}

class _Booking {
  final String handle;
  final String startTime;
  final int? durationMinutes;
  final String? notes;
  final String? businessDisplayName;
  final String? businessName;
  final String? businessAddress;
  final String? businessPhone;

  const _Booking({
    required this.handle,
    required this.startTime,
    this.durationMinutes,
    this.notes,
    this.businessDisplayName,
    this.businessName,
    this.businessAddress,
    this.businessPhone,
  });

  factory _Booking.fromJson(Map<String, dynamic> json) {
    final biz = (json['business'] as Map<String, dynamic>?) ?? {};
    return _Booking(
      handle: json['handle'] as String? ?? '',
      startTime: json['startTime'] as String? ?? '',
      durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
      notes: json['notes'] as String?,
      businessDisplayName: biz['displayName'] as String?,
      businessName: biz['businessName'] as String?,
      businessAddress: biz['address'] as String?,
      businessPhone: biz['phoneNumber'] as String?,
    );
  }
}
