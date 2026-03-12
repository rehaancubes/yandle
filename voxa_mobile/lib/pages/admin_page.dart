import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api_config.dart';
import '../services/auth_service.dart';

class AdminPage extends StatefulWidget {
  final String handle;
  final String? displayName;
  final String? useCase;
  final Color themeColor;

  const AdminPage({
    super.key,
    required this.handle,
    this.displayName,
    this.useCase,
    this.themeColor = const Color(0xFF4F46E5),
  });

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  String get _useCase => (widget.useCase ?? '').toLowerCase();
  bool get _isClinic =>
      _useCase.contains('clinic') ||
      _useCase.contains('doctor') ||
      _useCase.contains('medical') ||
      _useCase.contains('health');
  bool get _isGamingCafe => _useCase.contains('gaming');
  bool get _isSalon => _useCase.contains('salon');

  // ── Bookings state ──────────────────────────────────────────────────────────
  List<_AdminBooking> _bookings = [];
  bool _bookingsLoading = true;
  String? _bookingsError;
  final Set<String> _cancelling = {};

  // ── Resource state ────────────────────────────────────────────────────────
  List<_Resource> _resources = [];
  bool _resourcesLoading = false;

  // ── Tokens state ────────────────────────────────────────────────────────────
  List<_Token> _tokens = [];
  bool _tokensLoading = true;
  String? _tokensError;
  final Set<String> _updatingToken = {};

  Color get _themeColor => widget.themeColor;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _isClinic ? 2 : 1, vsync: this);
    _loadBookings();
    _loadResources();
    if (_isClinic) _loadTokens();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  Future<void> _loadBookings() async {
    setState(() {
      _bookingsLoading = true;
      _bookingsError = null;
    });
    try {
      final token = await AuthService.getIdToken();
      final now = DateTime.now();
      final todayStart =
          DateTime(now.year, now.month, now.day).toUtc().toIso8601String();
      final todayEnd = DateTime(now.year, now.month, now.day + 1)
          .toUtc()
          .toIso8601String();

      final uri = Uri.parse('$apiBase/bookings').replace(queryParameters: {
        'handle': widget.handle,
        'fromTime': todayStart,
        'toTime': todayEnd,
        'limit': '100',
      });
      final res = await http.get(
        uri,
        headers: {
          if (token != null) 'authorization': 'Bearer $token',
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (data['bookings'] as List<dynamic>? ?? [])
            .map((e) => _AdminBooking.fromJson(e as Map<String, dynamic>))
            .toList();
        list.sort((a, b) => a.startTime.compareTo(b.startTime));
        if (mounted) setState(() => _bookings = list);
      } else {
        if (mounted) setState(() => _bookingsError = 'Could not load bookings.');
      }
    } catch (_) {
      if (mounted) setState(() => _bookingsError = 'Network error.');
    } finally {
      if (mounted) setState(() => _bookingsLoading = false);
    }
  }

  Future<void> _loadResources() async {
    String? endpoint;
    if (_isGamingCafe) {
      endpoint = '/centers';
    } else if (_isSalon) {
      endpoint = '/branches';
    } else if (_isClinic) {
      endpoint = '/doctors';
    }
    if (endpoint == null) return;

    setState(() => _resourcesLoading = true);
    try {
      final token = await AuthService.getIdToken();
      final uri = Uri.parse('$apiBase$endpoint').replace(queryParameters: {
        'handle': widget.handle,
      });
      final res = await http.get(
        uri,
        headers: {
          if (token != null) 'authorization': 'Bearer $token',
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final key = endpoint.replaceFirst('/', ''); // centers, branches, doctors
        final list = (data[key] as List<dynamic>? ?? [])
            .map((e) => _Resource.fromJson(e as Map<String, dynamic>))
            .toList();
        if (mounted) setState(() => _resources = list);
      }
    } catch (_) {
      // silently fail — bookings still display in fallback mode
    } finally {
      if (mounted) setState(() => _resourcesLoading = false);
    }
  }

  Future<void> _loadTokens() async {
    setState(() {
      _tokensLoading = true;
      _tokensError = null;
    });
    try {
      final token = await AuthService.getIdToken();
      final date = _todayDate();
      final uri = Uri.parse('$apiBase/tokens').replace(queryParameters: {
        'handle': widget.handle,
        'date': date,
      });
      final res = await http.get(
        uri,
        headers: {
          if (token != null) 'authorization': 'Bearer $token',
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (data['tokens'] as List<dynamic>? ?? [])
            .map((e) => _Token.fromJson(e as Map<String, dynamic>))
            .toList();
        if (mounted) setState(() => _tokens = list);
      } else {
        if (mounted) setState(() => _tokensError = 'Could not load tokens.');
      }
    } catch (_) {
      if (mounted) setState(() => _tokensError = 'Network error.');
    } finally {
      if (mounted) setState(() => _tokensLoading = false);
    }
  }

  Future<void> _cancelBooking(_AdminBooking b) async {
    final key = b.startTime;
    setState(() => _cancelling.add(key));
    try {
      final token = await AuthService.getIdToken();
      final res = await http.delete(
        Uri.parse(
            '$apiBase/bookings?handle=${Uri.encodeComponent(widget.handle)}&startTime=${Uri.encodeComponent(b.startTime)}'),
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
              backgroundColor: _themeColor,
            ),
          );
        }
      } else {
        _snack('Could not cancel. Try again.', isError: true);
      }
    } catch (_) {
      _snack('Network error.', isError: true);
    } finally {
      if (mounted) setState(() => _cancelling.remove(key));
    }
  }

  Future<void> _updateTokenStatus(_Token t, String status) async {
    setState(() => _updatingToken.add(t.tokenId));
    try {
      final token = await AuthService.getIdToken();
      final res = await http.patch(
        Uri.parse('$apiBase/tokens'),
        headers: {
          'content-type': 'application/json',
          if (token != null) 'authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'handle': widget.handle,
          'tokenId': t.tokenId,
          'status': status,
        }),
      );
      if (res.statusCode == 200) {
        if (mounted) {
          setState(() {
            final idx = _tokens.indexWhere((x) => x.tokenId == t.tokenId);
            if (idx >= 0) {
              _tokens[idx] = _tokens[idx].copyWith(status: status);
            }
          });
        }
      } else {
        _snack('Could not update token.', isError: true);
      }
    } catch (_) {
      _snack('Network error.', isError: true);
    } finally {
      if (mounted) setState(() => _updatingToken.remove(t.tokenId));
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  String _todayDate() {
    final now = DateTime.now();
    final m = now.month.toString().padLeft(2, '0');
    final d = now.day.toString().padLeft(2, '0');
    return '${now.year}-$m-$d';
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
      final m = dt.minute.toString().padLeft(2, '0');
      final ampm = dt.hour < 12 ? 'AM' : 'PM';
      return '$h:$m $ampm';
    } catch (_) {
      return iso;
    }
  }

  void _snack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? Colors.redAccent : _themeColor,
      ),
    );
  }

  Future<bool?> _confirmCancel(_AdminBooking b) => showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: const Text('Cancel booking?',
              style: TextStyle(color: Colors.white)),
          content: Text(
            'Cancel booking for ${b.customerName ?? b.customerEmail ?? 'guest'} at ${_formatTime(b.startTime)}?',
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

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = widget.displayName ?? '@${widget.handle}';
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        backgroundColor: const Color(0xFF020617),
        foregroundColor: Colors.white,
        title: Text(title,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        bottom: _isClinic
            ? TabBar(
                controller: _tabs,
                indicatorColor: _themeColor,
                labelColor: _themeColor,
                unselectedLabelColor: Colors.white54,
                tabs: const [
                  Tab(text: "Today's Bookings"),
                  Tab(text: 'Token Queue'),
                ],
              )
            : null,
      ),
      body: _isClinic
          ? TabBarView(
              controller: _tabs,
              children: [_buildBookings(theme), _buildTokens(theme)],
            )
          : _buildBookings(theme),
    );
  }

  // ── Bookings tab ─────────────────────────────────────────────────────────────

  Widget _buildBookings(ThemeData theme) {
    if (_bookingsLoading || _resourcesLoading) {
      return const Center(
          child: CircularProgressIndicator(color: _themeColor));
    }
    if (_bookingsError != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent, size: 36),
            const SizedBox(height: 8),
            Text(_bookingsError!,
                style: const TextStyle(color: Colors.white54)),
            const SizedBox(height: 12),
            TextButton(onPressed: _loadBookings, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_bookings.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.event_available_outlined,
                color: Colors.white24, size: 48),
            const SizedBox(height: 12),
            Text(
              'No bookings today.',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: Colors.white54),
            ),
          ],
        ),
      );
    }

    // Route to resource view if we have resources, otherwise flat list fallback
    if (_resources.isNotEmpty) {
      if (_isGamingCafe) return _buildGamingView(theme);
      if (_isSalon) return _buildSalonView(theme);
      if (_isClinic) return _buildClinicView(theme);
    }

    return _buildFlatBookingsList(theme);
  }

  Widget _buildFlatBookingsList(ThemeData theme) {
    return RefreshIndicator(
      onRefresh: _loadBookings,
      color: _themeColor,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _bookings.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _BookingCard(
          b: _bookings[i],
          cancelling: _cancelling.contains(_bookings[i].startTime),
          formatTime: _formatTime,
          themeColor: _themeColor,
          onCancel: () async {
            final ok = await _confirmCancel(_bookings[i]);
            if (ok == true) _cancelBooking(_bookings[i]);
          },
        ),
      ),
    );
  }

  // ── Gaming cafe resource view ───────────────────────────────────────────────

  Widget _buildGamingView(ThemeData theme) {
    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadBookings(), _loadResources()]);
      },
      color: _themeColor,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _resources.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final center = _resources[i];
          final centerBookings = _bookings
              .where((b) =>
                  (b.centerName ?? '').toLowerCase() ==
                  center.name.toLowerCase())
              .toList();
          // Group bookings by machine type
          final machineTypes = center.machineTypes.isNotEmpty
              ? center.machineTypes
              : centerBookings
                  .map((b) => b.machineType ?? 'General')
                  .toSet()
                  .toList();

          return _ResourceCard(
            icon: Icons.sports_esports_outlined,
            title: center.name,
            subtitle: '${machineTypes.length} machine type${machineTypes.length == 1 ? '' : 's'}',
            accentColor: _themeColor,
            child: Column(
              children: [
                for (int j = 0; j < machineTypes.length; j++) ...[
                  if (j > 0)
                    Divider(
                      color: const Color(0xFF1E293B),
                      height: 16,
                    ),
                  _buildMachineTypeRow(
                    machineTypes[j],
                    centerBookings
                        .where((b) =>
                            (b.machineType ?? 'General') == machineTypes[j])
                        .toList(),
                    center.capacity,
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMachineTypeRow(
      String machineType, List<_AdminBooking> bookings, int? totalCapacity) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.computer, color: Colors.white38, size: 14),
            const SizedBox(width: 6),
            Text(
              machineType,
              style: const TextStyle(
                color: Colors.white70,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
            const Spacer(),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: _themeColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '${bookings.length} booked${totalCapacity != null ? ' / $totalCapacity' : ''}',
                style: const TextStyle(
                  color: _themeColor,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        if (bookings.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: bookings.map((b) {
              return _BookingChip(
                label:
                    '${b.customerName ?? b.customerEmail ?? 'Guest'} ${_formatTime(b.startTime)}',
                color: _themeColor,
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  // ── Salon resource view ────────────────────────────────────────────────────

  Widget _buildSalonView(ThemeData theme) {
    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadBookings(), _loadResources()]);
      },
      color: _themeColor,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _resources.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final branch = _resources[i];
          final branchBookings = _bookings
              .where((b) => b.branchId == branch.id)
              .toList();
          final capacity = branch.capacity ?? 0;
          final bookedCount = branchBookings.length;
          final availableCount =
              capacity > bookedCount ? capacity - bookedCount : 0;

          return _ResourceCard(
            icon: Icons.content_cut_outlined,
            title: branch.name,
            subtitle: capacity > 0
                ? '$bookedCount / $capacity slots filled'
                : '$bookedCount booked',
            accentColor: _themeColor,
            trailing: capacity > 0
                ? Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF22C55E).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      '$availableCount avail.',
                      style: const TextStyle(
                        color: Color(0xFF22C55E),
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  )
                : null,
            child: branchBookings.isNotEmpty
                ? Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: branchBookings.map((b) {
                      return _BookingChip(
                        label:
                            '${b.customerName ?? b.customerEmail ?? 'Guest'} ${_formatTime(b.startTime)}',
                        color: _themeColor,
                      );
                    }).toList(),
                  )
                : Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'No bookings yet',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.3),
                        fontSize: 12,
                      ),
                    ),
                  ),
          );
        },
      ),
    );
  }

  // ── Clinic resource view ──────────────────────────────────────────────────

  Widget _buildClinicView(ThemeData theme) {
    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadBookings(), _loadResources()]);
      },
      color: _themeColor,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _resources.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final doctor = _resources[i];
          final doctorBookings = _bookings
              .where((b) => b.doctorId == doctor.id)
              .toList();

          return _ResourceCard(
            icon: Icons.medical_services_outlined,
            title: doctor.name,
            subtitle: '${doctorBookings.length} appointment${doctorBookings.length == 1 ? '' : 's'} today',
            accentColor: _themeColor,
            child: doctorBookings.isNotEmpty
                ? Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: doctorBookings.map((b) {
                      return _BookingChip(
                        label:
                            '${b.customerName ?? b.customerEmail ?? 'Guest'} ${_formatTime(b.startTime)}',
                        color: _themeColor,
                      );
                    }).toList(),
                  )
                : Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'No appointments yet',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.3),
                        fontSize: 12,
                      ),
                    ),
                  ),
          );
        },
      ),
    );
  }

  // ── Token queue tab ───────────────────────────────────────────────────────────

  Widget _buildTokens(ThemeData theme) {
    if (_tokensLoading) {
      return const Center(
          child: CircularProgressIndicator(color: _themeColor));
    }
    if (_tokensError != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent, size: 36),
            const SizedBox(height: 8),
            Text(_tokensError!, style: const TextStyle(color: Colors.white54)),
            const SizedBox(height: 12),
            TextButton(onPressed: _loadTokens, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_tokens.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.confirmation_number_outlined,
                color: Colors.white24, size: 48),
            const SizedBox(height: 12),
            Text(
              'No tokens today.',
              style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white54),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadTokens,
      color: _themeColor,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _tokens.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _TokenCard(
          t: _tokens[i],
          updating: _updatingToken.contains(_tokens[i].tokenId),
          onUpdateStatus: (status) => _updateTokenStatus(_tokens[i], status),
          themeColor: _themeColor,
        ),
      ),
    );
  }
}

// ─── Booking card ─────────────────────────────────────────────────────────────

class _BookingCard extends StatelessWidget {
  final _AdminBooking b;
  final bool cancelling;
  final String Function(String) formatTime;
  final VoidCallback onCancel;
  final Color themeColor;

  const _BookingCard({
    required this.b,
    required this.cancelling,
    required this.formatTime,
    required this.onCancel,
    required this.themeColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  b.customerName ?? b.customerEmail ?? 'Guest',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
              ),
              Text(
                formatTime(b.startTime),
                style: TextStyle(
                  color: themeColor,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          if (b.customerPhone != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                b.customerPhone!,
                style:
                    const TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ),
          if (b.notes != null && b.notes!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                b.notes!,
                style:
                    const TextStyle(color: Colors.white38, fontSize: 12),
              ),
            ),
          if (b.durationMinutes != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                '${b.durationMinutes} min',
                style:
                    const TextStyle(color: Colors.white38, fontSize: 12),
              ),
            ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: cancelling ? null : onCancel,
              icon: cancelling
                  ? const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                          strokeWidth: 1.5, color: Colors.redAccent),
                    )
                  : const Icon(Icons.cancel_outlined, size: 14),
              label: const Text('Cancel'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.redAccent,
                side: const BorderSide(color: Colors.redAccent),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                textStyle: const TextStyle(fontSize: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Token card ───────────────────────────────────────────────────────────────

class _TokenCard extends StatelessWidget {
  final _Token t;
  final bool updating;
  final void Function(String status) onUpdateStatus;
  final Color themeColor;

  const _TokenCard({
    required this.t,
    required this.updating,
    required this.onUpdateStatus,
    required this.themeColor,
  });

  Map<String, Color> get _statusColors => {
        'WAITING': const Color(0xFFF59E0B),
        'CALLED': themeColor,
        'DONE': const Color(0xFF22C55E),
        'NO_SHOW': Colors.white38,
      };

  @override
  Widget build(BuildContext context) {
    final color = _statusColors[t.status] ?? Colors.white38;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text(
                    '${t.tokenNumber}',
                    style: TextStyle(
                      color: color,
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
                      t.patientName ?? t.phone ?? 'Patient #${t.tokenNumber}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (t.phone != null && t.patientName != null)
                      Text(t.phone!,
                          style: const TextStyle(
                              color: Colors.white54, fontSize: 12)),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  t.status,
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          if (!updating && t.status != 'DONE' && t.status != 'NO_SHOW') ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (t.status == 'WAITING')
                  _ActionButton(
                    label: 'Call',
                    color: themeColor,
                    onTap: () => onUpdateStatus('CALLED'),
                  ),
                if (t.status == 'CALLED') ...[
                  _ActionButton(
                    label: 'Done',
                    color: const Color(0xFF22C55E),
                    onTap: () => onUpdateStatus('DONE'),
                  ),
                  const SizedBox(width: 8),
                  _ActionButton(
                    label: 'No Show',
                    color: Colors.white38,
                    onTap: () => onUpdateStatus('NO_SHOW'),
                  ),
                ],
              ],
            ),
          ] else if (updating)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: SizedBox(
                height: 20,
                child: LinearProgressIndicator(
                  color: themeColor,
                  backgroundColor: const Color(0xFF1E293B),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
      child: Text(label),
    );
  }
}

// ─── Resource card ────────────────────────────────────────────────────────────

class _ResourceCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color accentColor;
  final Widget? trailing;
  final Widget child;

  const _ResourceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.accentColor,
    this.trailing,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: accentColor, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF020617),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: const Color(0xFF1E293B).withValues(alpha: 0.5),
              ),
            ),
            child: child,
          ),
        ],
      ),
    );
  }
}

// ─── Booking chip ─────────────────────────────────────────────────────────────

class _BookingChip extends StatelessWidget {
  final String label;
  final Color color;

  const _BookingChip({
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color.withValues(alpha: 0.85),
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

// ─── Models ───────────────────────────────────────────────────────────────────

class _AdminBooking {
  final String startTime;
  final int? durationMinutes;
  final String? notes;
  final String? customerName;
  final String? customerEmail;
  final String? customerPhone;
  final String? centerName;
  final String? machineType;
  final String? branchId;
  final String? doctorId;
  final String? serviceId;

  const _AdminBooking({
    required this.startTime,
    this.durationMinutes,
    this.notes,
    this.customerName,
    this.customerEmail,
    this.customerPhone,
    this.centerName,
    this.machineType,
    this.branchId,
    this.doctorId,
    this.serviceId,
  });

  factory _AdminBooking.fromJson(Map<String, dynamic> json) => _AdminBooking(
        startTime: json['startTime'] as String? ?? '',
        durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
        notes: json['notes'] as String?,
        customerName: json['name'] as String?,
        customerEmail: json['email'] as String?,
        customerPhone: json['phone'] as String?,
        centerName: json['centerName'] as String?,
        machineType: json['machineType'] as String?,
        branchId: json['branchId'] as String?,
        doctorId: json['doctorId'] as String?,
        serviceId: json['serviceId'] as String?,
      );
}

class _Resource {
  final String id;
  final String name;
  final int? capacity;
  final List<String> machineTypes;

  const _Resource({
    required this.id,
    required this.name,
    this.capacity,
    this.machineTypes = const [],
  });

  factory _Resource.fromJson(Map<String, dynamic> json) {
    final machines = (json['machineTypes'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        [];
    return _Resource(
      id: json['id'] as String? ??
          json['centerId'] as String? ??
          json['branchId'] as String? ??
          json['doctorId'] as String? ??
          '',
      name: json['name'] as String? ??
          json['centerName'] as String? ??
          json['branchName'] as String? ??
          json['doctorName'] as String? ??
          'Unnamed',
      capacity: (json['capacity'] as num?)?.toInt(),
      machineTypes: machines,
    );
  }
}

class _Token {
  final String tokenId;
  final int tokenNumber;
  final String status;
  final String? patientName;
  final String? phone;

  const _Token({
    required this.tokenId,
    required this.tokenNumber,
    required this.status,
    this.patientName,
    this.phone,
  });

  factory _Token.fromJson(Map<String, dynamic> json) => _Token(
        tokenId: json['tokenId'] as String? ?? '',
        tokenNumber: (json['tokenNumber'] as num?)?.toInt() ?? 0,
        status: json['status'] as String? ?? 'WAITING',
        patientName: json['patientName'] as String?,
        phone: json['phone'] as String?,
      );

  _Token copyWith({String? status}) => _Token(
        tokenId: tokenId,
        tokenNumber: tokenNumber,
        status: status ?? this.status,
        patientName: patientName,
        phone: phone,
      );
}
