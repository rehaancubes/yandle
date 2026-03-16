import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../api_config.dart';
import '../services/auth_service.dart';
import '../voice/nova_voice_client.dart';

class BusinessDetailPage extends StatefulWidget {
  const BusinessDetailPage({
    super.key,
    required this.handle,
    this.displayName,
    this.businessName,
    this.address,
    this.city,
    this.phoneNumber,
    this.hasAiPhone = false,
    this.hasWalkInSlots = false,
    this.supportsUrgentCases = false,
    this.locationId,
    this.branchId,
    this.centerId,
    this.locationName,
    /// Optional image URL from discover list (shown until profile loads).
    this.initialImageUrl,
  });

  final String handle;
  final String? displayName;
  final String? businessName;
  final String? address;
  final String? city;
  final String? phoneNumber;
  final bool hasAiPhone;
  final bool hasWalkInSlots;
  final bool supportsUrgentCases;
  final String? locationId;
  final String? branchId;
  final String? centerId;
  final String? locationName;
  final String? initialImageUrl;

  @override
  State<BusinessDetailPage> createState() => _BusinessDetailPageState();
}

/// One center from profile.centers (gaming cafe).
class _GamingCenter {
  _GamingCenter({required this.centerId, required this.name, required this.machines});
  final String centerId;
  final String name;
  final List<_MachineType> machines;
}

class _MachineType {
  _MachineType({required this.type, this.name, this.count = 1});
  final String type;
  final String? name;
  final int count;
}

class _BusinessDetailPageState extends State<BusinessDetailPage> {
  bool _isLoadingProfile = false;
  String? _profileError;
  String? _resolvedDisplayName;
  String? _resolvedBusinessName;
  String? _resolvedAddress;
  String? _resolvedCity;
  String? _resolvedPhone;
  bool _resolvedHasAiPhone = false;
  bool _resolvedHasWalkIn = false;
  bool _resolvedSupportsUrgent = false;
  List<String> _galleryImages = [];
  String? _useCaseId;
  List<_GamingCenter> _centers = [];
  String? _selectedCenterId;
  String? _selectedMachineType;

  NovaVoiceClient? _voiceClient;

  DateTime? _selectedSlotDate;
  List<Map<String, dynamic>> _slots = [];
  bool _slotsLoading = false;
  String? _slotsError;
  bool _bookingInProgress = false;
  int _selectedDurationMinutes = 60;

  String? _sessionId;
  bool _isSending = false;
  final TextEditingController _chatController = TextEditingController();
  final List<_ChatMessage> _messages = [];

  bool get _isGamingCafe => _useCaseId == 'gaming_cafe' && _centers.isNotEmpty;
  _GamingCenter? get _selectedCenter {
    if (_selectedCenterId == null) return _centers.isNotEmpty ? _centers.first : null;
    try {
      return _centers.firstWhere((c) => c.centerId == _selectedCenterId);
    } catch (_) {
      return _centers.isNotEmpty ? _centers.first : null;
    }
  }

  @override
  void initState() {
    super.initState();
    _resolvedDisplayName = widget.displayName;
    _resolvedBusinessName = widget.businessName;
    _resolvedAddress = widget.address;
    _resolvedCity = widget.city;
    _resolvedPhone = widget.phoneNumber;
    _resolvedHasAiPhone = widget.hasAiPhone;
    _resolvedHasWalkIn = widget.hasWalkInSlots;
    _resolvedSupportsUrgent = widget.supportsUrgentCases;
    if (widget.initialImageUrl != null && widget.initialImageUrl!.isNotEmpty) {
      _galleryImages = [widget.initialImageUrl!];
    }
    _loadProfile();
    _initVoiceClient();
  }

  Future<void> _initVoiceClient() async {
    final email = await AuthService.getCurrentUserEmail();
    if (mounted) {
      final client = NovaVoiceClient(handle: widget.handle, callerName: email);
      client.addListener(_onVoiceStateChanged);
      setState(() {
        _voiceClient = client;
      });
    }
  }

  void _onVoiceStateChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _voiceClient?.removeListener(_onVoiceStateChanged);
    _voiceClient?.dispose();
    _chatController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _isLoadingProfile = true;
      _profileError = null;
    });

    try {
      final uri = Uri.parse('$apiBase/public/${widget.handle}');
      final resp = await http.get(uri);
      if (resp.statusCode != 200) {
        setState(() {
          _profileError = 'Failed to load profile (${resp.statusCode}).';
        });
        return;
      }
      final decoded = json.decode(resp.body) as Map<String, dynamic>;
      final profile = decoded['profile'] as Map<String, dynamic>? ?? {};

      var galleryList = <String>[];
      final gallery = profile['galleryImages'];
      if (gallery is List) {
        galleryList = gallery
            .map((e) => e?.toString())
            .where((s) => s != null && s.isNotEmpty)
            .cast<String>()
            .toList();
      }
      if (galleryList.isEmpty && mounted) {
        try {
          final webUri = Uri.parse('$apiBase/website/public/${widget.handle}');
          final webResp = await http.get(webUri);
          if (webResp.statusCode == 200) {
            final webDecoded = json.decode(webResp.body) as Map<String, dynamic>;
            final webGallery = webDecoded['galleryImages'];
            if (webGallery is List) {
              galleryList = webGallery
                  .map((e) => e?.toString())
                  .where((s) => s != null && s.isNotEmpty)
                  .cast<String>()
                  .toList();
            }
          }
        } catch (_) {}
      }
      if (galleryList.isEmpty && widget.initialImageUrl != null && widget.initialImageUrl!.isNotEmpty) {
        galleryList = [widget.initialImageUrl!];
      }

      var centersList = <_GamingCenter>[];
      final centersRaw = profile['centers'];
      if (centersRaw is List) {
        for (final c in centersRaw) {
          if (c is! Map<String, dynamic>) continue;
          final centerId = c['centerId'] as String? ?? '';
          final name = c['name'] as String? ?? centerId;
          final machinesRaw = c['machines'];
          var machines = <_MachineType>[];
          if (machinesRaw is List) {
            for (final m in machinesRaw) {
              if (m is! Map<String, dynamic>) continue;
              final type = m['type'] as String? ?? '';
              if (type.isEmpty) continue;
              machines.add(_MachineType(
                type: type,
                name: m['name'] as String?,
                count: (m['count'] is int) ? m['count'] as int : (m['count'] is num) ? (m['count'] as num).toInt() : 1,
              ));
            }
          }
          if (centerId.isNotEmpty) centersList.add(_GamingCenter(centerId: centerId, name: name, machines: machines));
        }
      }

      if (mounted) {
        setState(() {
          _resolvedDisplayName ??=
              profile['displayName'] as String? ?? widget.handle;
          _resolvedBusinessName ??=
              profile['businessName'] as String? ?? _resolvedDisplayName;
          _resolvedAddress ??= profile['address'] as String?;
          _resolvedCity ??= profile['city'] as String?;
          // Prefer profile phone from server so purchased number always shows
          final profilePhone = profile['phoneNumber'] as String?;
          if (profilePhone != null && profilePhone.trim().isNotEmpty) {
            _resolvedPhone = profilePhone.trim();
          } else {
            _resolvedPhone ??= widget.phoneNumber;
          }
          _resolvedHasAiPhone =
              (profile['hasAiPhone'] as bool?) ?? _resolvedHasAiPhone;
          _galleryImages = galleryList;
          _useCaseId = profile['useCaseId'] as String?;
          _centers = centersList;
          if (_centers.isNotEmpty && _selectedCenterId == null) {
            _selectedCenterId = _centers.first.centerId;
            _selectedMachineType = _selectedCenter?.machines.isNotEmpty == true
                ? _selectedCenter!.machines.first.type
                : null;
          }
          final ra = profile['realtimeAvailability'] as Map<String, dynamic>?;
          if (ra != null) {
            _resolvedHasWalkIn =
                (ra['hasWalkInSlots'] as bool?) ?? _resolvedHasWalkIn;
            _resolvedSupportsUrgent =
                (ra['supportsUrgentCases'] as bool?) ?? _resolvedSupportsUrgent;
          }
          if (_selectedSlotDate == null) _selectedSlotDate = DateTime.now();
        });
      }
      if (mounted && _selectedSlotDate != null) _loadSlots(_selectedSlotDate!);

      if (_messages.isEmpty && mounted) {
        final who = _resolvedBusinessName ?? _resolvedDisplayName;
        setState(() {
          _messages.add(
            _ChatMessage(
              role: _ChatRole.assistant,
              text:
                  'Hey, I am $who\'s Yandle assistant. Ask me anything about services, pricing, or availability.',
              time: DateTime.now(),
            ),
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _profileError = 'Could not load profile.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingProfile = false;
        });
      }
    }
  }

  Future<String> _ensureSession() async {
    if (_sessionId != null) return _sessionId!;
    final token = await AuthService.getIdToken();
    final uri = Uri.parse('$apiBase/session');
    final resp = await http.post(
      uri,
      headers: {
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'owner': 'mobile-visitor',
        'handle': widget.handle,
        'channel': 'text',
      }),
    );
    if (resp.statusCode != 201 && resp.statusCode != 200) {
      throw Exception('Could not start session (${resp.statusCode}).');
    }
    final decoded = json.decode(resp.body) as Map<String, dynamic>;
    final sid = decoded['sessionId'] as String?;
    if (sid == null || sid.isEmpty) {
      throw Exception('Session ID missing from response.');
    }
    _sessionId = sid;
    return sid;
  }

  Future<void> _sendChat() async {
    final text = _chatController.text.trim();
    if (text.isEmpty || _isSending) return;

    setState(() {
      _chatController.clear();
      _isSending = true;
      _messages.add(
        _ChatMessage(
          role: _ChatRole.visitor,
          text: text,
          time: DateTime.now(),
        ),
      );
    });

    try {
      final sid = await _ensureSession();
      final uri = Uri.parse('$apiBase/message');
      final resp = await http.post(
        uri,
        headers: {'content-type': 'application/json'},
        body: jsonEncode({
          'sessionId': sid,
          'message': text,
        }),
      );
      if (resp.statusCode != 200) {
        throw Exception('Message failed (${resp.statusCode}).');
      }
      final decoded = json.decode(resp.body) as Map<String, dynamic>;
      final reply = decoded['reply'] as String? ?? 'I had trouble answering.';
      setState(() {
        _messages.add(
          _ChatMessage(
            role: _ChatRole.assistant,
            text: reply,
            time: DateTime.now(),
          ),
        );
      });
    } catch (e) {
      setState(() {
        _messages.add(
          _ChatMessage(
            role: _ChatRole.assistant,
            text: 'Error: $e',
            time: DateTime.now(),
          ),
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSending = false;
        });
      }
    }
  }

  Future<void> _callBusiness() async {
    final phone = _resolvedPhone;
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  String _formatSlotDate(DateTime d) {
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  Future<void> _loadSlots(DateTime date) async {
    setState(() {
      _selectedSlotDate = date;
      _slotsLoading = true;
      _slotsError = null;
      _slots = [];
    });
    try {
      final dateStr = _formatSlotDate(date);
      final params = <String, String>{'date': dateStr};
      if (_isGamingCafe) {
        final center = _selectedCenter;
        if (center != null) params['centerName'] = center.name;
        if (_selectedMachineType != null && _selectedMachineType!.isNotEmpty) {
          params['machineType'] = _selectedMachineType!;
        }
      }
      final uri = Uri.parse('$apiBase/public/${widget.handle}/slots').replace(queryParameters: params);
      final resp = await http.get(uri);
      if (!mounted) return;
      if (resp.statusCode != 200) {
        setState(() {
          _slotsError = 'Could not load slots.';
          _slotsLoading = false;
        });
        return;
      }
      final decoded = json.decode(resp.body) as Map<String, dynamic>;
      final list = decoded['slots'] as List<dynamic>? ?? [];
      setState(() {
        _slots = list.map((e) => e as Map<String, dynamic>).toList();
        _slotsLoading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _slotsError = 'Network error.';
          _slotsLoading = false;
        });
      }
    }
  }

  static const List<int> _durationOptions = [30, 60, 90, 120];

  Future<void> _bookSlot(Map<String, dynamic> slot) async {
    final startTime = slot['startTime'] as String? ?? '';
    if (startTime.isEmpty) return;
    final theme = Theme.of(context);
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final emailController = TextEditingController();
    int durationMinutes = _selectedDurationMinutes;
    final email = await AuthService.getCurrentUserEmail();
    if (email != null) emailController.text = email;

    String timeLabel = startTime;
    if (startTime.length >= 16) timeLabel = startTime.substring(11, 16);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: const Color(0xFF0F172A),
              title: const Text('Confirm booking', style: TextStyle(color: Colors.white)),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Time: $timeLabel', style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70)),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int>(
                      value: durationMinutes,
                      decoration: const InputDecoration(
                        labelText: 'Duration',
                        labelStyle: TextStyle(color: Colors.white70),
                        border: OutlineInputBorder(),
                        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF1E293B))),
                      ),
                      dropdownColor: const Color(0xFF0F172A),
                      style: const TextStyle(color: Colors.white),
                      items: _durationOptions
                          .map((m) => DropdownMenuItem<int>(
                                value: m,
                                child: Text('$m min'),
                              ))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) {
                          durationMinutes = v;
                          setDialogState(() {});
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
                      style: const TextStyle(color: Colors.white),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: phoneController,
                      decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder()),
                      keyboardType: TextInputType.phone,
                      style: const TextStyle(color: Colors.white),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: emailController,
                      decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
                FilledButton(
                  onPressed: () => Navigator.of(ctx).pop(true),
                  child: const Text('Book'),
                ),
              ],
            );
          },
        );
      },
    );
    if (confirmed != true || !mounted) return;

    setState(() => _bookingInProgress = true);
    try {
      final token = await AuthService.getIdToken();
      final body = <String, dynamic>{
        'handle': widget.handle,
        'startTime': startTime,
        'name': nameController.text.trim(),
        'phone': phoneController.text.trim(),
        'email': emailController.text.trim(),
        'durationMinutes': durationMinutes,
      };
      if (widget.branchId != null && widget.branchId!.isNotEmpty) body['branchId'] = widget.branchId!;
      if (widget.centerId != null && widget.centerId!.isNotEmpty) body['centerId'] = widget.centerId!;
      if (widget.locationId != null && widget.locationId!.isNotEmpty) body['locationId'] = widget.locationId!;
      if (_isGamingCafe) {
        final center = _selectedCenter;
        if (center != null) body['centerName'] = center.name;
        if (_selectedMachineType != null && _selectedMachineType!.isNotEmpty) {
          body['machineType'] = _selectedMachineType!;
        }
      }

      final uri = Uri.parse('$apiBase/bookings');
      final resp = await http.post(
        uri,
        headers: {
          'content-type': 'application/json',
          if (token != null) 'authorization': 'Bearer $token',
        },
        body: json.encode(body),
      );
      if (!mounted) return;
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Booking confirmed. Check My Bookings.')),
        );
        _loadSlots(_selectedSlotDate!);
      } else {
        final err = json.decode(resp.body) as Map<String, dynamic>?;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err?['error'] as String? ?? 'Booking failed.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _bookingInProgress = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name =
        _resolvedBusinessName ?? _resolvedDisplayName ?? widget.handle;

    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        title: Text(name),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          if (_isLoadingProfile)
            const LinearProgressIndicator(
              minHeight: 2,
              color: Color(0xFF4F46E5),
            ),
          if (_profileError != null)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  const Icon(Icons.error_outline,
                      size: 18, color: Colors.redAccent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _profileError!,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: Colors.redAccent),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildGallery(theme),
                  _buildInfoBlock(theme, name),
                  const Divider(height: 1, color: Color(0xFF1E293B)),
                  _buildBookSection(theme),
                  const Divider(height: 1, color: Color(0xFF1E293B)),
                  _buildTextSection(theme),
                  const Divider(height: 1, color: Color(0xFF1E293B)),
                  _buildVoiceSection(theme),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGallery(ThemeData theme) {
    if (_galleryImages.isEmpty) {
      return Container(
        height: 200,
        color: const Color(0xFF1E293B),
        child: Center(
          child: Icon(Icons.storefront_rounded, color: Colors.white24, size: 64),
        ),
      );
    }
    return SizedBox(
      height: 220,
      child: PageView.builder(
        itemCount: _galleryImages.length,
        itemBuilder: (context, index) {
          return Image.network(
            _galleryImages[index],
            fit: BoxFit.cover,
            loadingBuilder: (_, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Container(
                color: const Color(0xFF1E293B),
                child: Center(
                  child: CircularProgressIndicator(
                    color: const Color(0xFF4F46E5),
                    value: loadingProgress.expectedTotalBytes != null
                        ? loadingProgress.cumulativeBytesLoaded /
                            (loadingProgress.expectedTotalBytes ?? 1)
                        : null,
                  ),
                ),
              );
            },
            errorBuilder: (_, __, ___) => Container(
              color: const Color(0xFF1E293B),
              child: const Center(
                child: Icon(Icons.image_not_supported,
                    color: Colors.white38, size: 48),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildInfoBlock(ThemeData theme, String name) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          if (_resolvedAddress != null ||
              _resolvedCity != null ||
              _resolvedPhone != null)
            const SizedBox(height: 6),
          if (_resolvedAddress != null)
            Text(
              _resolvedAddress!,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: Colors.white70),
            ),
          if (_resolvedCity != null)
            Text(
              _resolvedCity!,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: Colors.white54),
            ),
          if (_resolvedPhone != null && _resolvedPhone!.isNotEmpty) ...[
            const SizedBox(height: 6),
            InkWell(
              onTap: _callBusiness,
              borderRadius: BorderRadius.circular(6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.phone_outlined,
                      size: 16, color: theme.colorScheme.primary),
                  const SizedBox(width: 6),
                  Text(
                    _resolvedPhone!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              if (_resolvedHasWalkIn)
                const _ChipPill(
                  label: 'Walk-ins welcome',
                  color: Color(0xFF22C55E),
                ),
              if (_resolvedSupportsUrgent)
                const _ChipPill(
                  label: 'Urgent / late-night',
                  color: Color(0xFFF97316),
                ),
              if (_resolvedHasAiPhone)
                const _ChipPill(
                  label: 'AI phone',
                  color: Color(0xFF4F46E5),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTextSection(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.chat_bubble_outline, color: const Color(0xFF4F46E5), size: 22),
              const SizedBox(width: 8),
              Text(
                'Chat with business',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            constraints: const BoxConstraints(maxHeight: 200),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final m = _messages[index];
                final isVisitor = m.role == _ChatRole.visitor;
                return Align(
                  alignment:
                      isVisitor ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: isVisitor
                          ? const Color(0xFF4F46E5).withValues(alpha: 0.2)
                          : const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isVisitor
                            ? const Color(0xFF4F46E5).withValues(alpha: 0.5)
                            : const Color(0xFF334155),
                      ),
                    ),
                    child: Text(
                      m.text,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.white,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _chatController,
                  style: const TextStyle(color: Colors.white),
                  cursorColor: Colors.white70,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendChat(),
                  decoration: const InputDecoration(
                    hintText: 'Ask about services, pricing…',
                    hintStyle: TextStyle(color: Colors.white38, fontSize: 13),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(999)),
                      borderSide: BorderSide(color: Color(0xFF1E293B)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(999)),
                      borderSide: BorderSide(color: Color(0xFF1E293B)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(999)),
                      borderSide: BorderSide(color: Color(0xFF4F46E5)),
                    ),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _isSending ? null : _sendChat,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF4F46E5),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                child: _isSending
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        ),
                      )
                    : const Icon(Icons.send, size: 18),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVoiceSection(ThemeData theme) {
    final hasPhone = _resolvedPhone != null && _resolvedPhone!.isNotEmpty;
    final voiceStatus = _voiceClient?.status ?? NovaVoiceStatus.idle;
    final isLive = voiceStatus == NovaVoiceStatus.live;
    final isBusy = voiceStatus == NovaVoiceStatus.connecting ||
        voiceStatus == NovaVoiceStatus.ready;
    final statusLabel = switch (voiceStatus) {
      NovaVoiceStatus.connecting => 'Connecting…',
      NovaVoiceStatus.ready => 'Setting up…',
      NovaVoiceStatus.live => 'Live',
      NovaVoiceStatus.error => _voiceClient?.error ?? 'Error',
      _ => null,
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF4F46E5).withValues(alpha: 0.18),
                ),
                child: const Icon(
                  Icons.waves_rounded,
                  color: Color(0xFF4F46E5),
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'AI voice agent',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Real-time voice call with this business.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (statusLabel != null) ...[
            const SizedBox(height: 8),
            Text(
              statusLabel,
              style: theme.textTheme.bodySmall?.copyWith(
                color: voiceStatus == NovaVoiceStatus.error
                    ? Colors.redAccent
                    : voiceStatus == NovaVoiceStatus.live
                        ? const Color(0xFF22C55E)
                        : Colors.white54,
              ),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: isBusy ? null : (isLive ? _stopAiVoice : _startAiVoice),
            icon: isBusy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(Colors.white70),
                    ),
                  )
                : Icon(isLive ? Icons.stop : Icons.play_arrow),
            label: Text(isLive ? 'End voice' : 'Start voice'),
            style: FilledButton.styleFrom(
              backgroundColor:
                  isLive ? const Color(0xFFDC2626) : const Color(0xFF4F46E5),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
          ),
          if (hasPhone) ...[
            const SizedBox(height: 10),
            TextButton.icon(
              onPressed: _callBusiness,
              icon: const Icon(Icons.call, size: 18),
              label: Text('Call $_resolvedPhone'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBookSection(ThemeData theme) {
    final dates = List.generate(7, (i) => DateTime.now().add(Duration(days: i)));
    final selectedCenter = _selectedCenter;
    final machineTypes = selectedCenter?.machines ?? [];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.calendar_today_outlined, color: const Color(0xFF4F46E5), size: 22),
              const SizedBox(width: 8),
              Text(
                'Book',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_isGamingCafe) ...[
            DropdownButtonFormField<String>(
              value: _selectedCenterId,
              decoration: const InputDecoration(
                labelText: 'Location / Center',
                labelStyle: TextStyle(color: Colors.white70),
                border: OutlineInputBorder(),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF1E293B))),
              ),
              dropdownColor: const Color(0xFF0F172A),
              style: const TextStyle(color: Colors.white),
              items: _centers
                  .map((c) => DropdownMenuItem<String>(
                        value: c.centerId,
                        child: Text(c.name),
                      ))
                  .toList(),
              onChanged: (v) {
                setState(() {
                  _selectedCenterId = v;
                  _selectedMachineType = null;
                  final c = _selectedCenter;
                  if (c != null && c.machines.isNotEmpty) {
                    _selectedMachineType = c.machines.first.type;
                  }
                });
                if (_selectedSlotDate != null) _loadSlots(_selectedSlotDate!);
              },
            ),
            const SizedBox(height: 12),
            if (machineTypes.isNotEmpty)
              DropdownButtonFormField<String>(
                value: _selectedMachineType != null && machineTypes.any((m) => m.type == _selectedMachineType)
                    ? _selectedMachineType
                    : machineTypes.first.type,
                decoration: const InputDecoration(
                  labelText: 'Device / Machine type',
                  labelStyle: TextStyle(color: Colors.white70),
                  border: OutlineInputBorder(),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF1E293B))),
                ),
                dropdownColor: const Color(0xFF0F172A),
                style: const TextStyle(color: Colors.white),
                items: machineTypes
                    .map((m) => DropdownMenuItem<String>(
                          value: m.type,
                          child: Text(m.name ?? m.type),
                        ))
                    .toList(),
                onChanged: (v) {
                  setState(() => _selectedMachineType = v);
                  if (_selectedSlotDate != null) _loadSlots(_selectedSlotDate!);
                },
              ),
            const SizedBox(height: 16),
          ],
          Row(
            children: [
              Text(
                'Duration',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white70,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 12),
              DropdownButton<int>(
                value: _selectedDurationMinutes,
                dropdownColor: const Color(0xFF0F172A),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                items: _durationOptions
                    .map((m) => DropdownMenuItem<int>(
                          value: m,
                          child: Text('$m min'),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _selectedDurationMinutes = v);
                },
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Date',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white70,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: dates.map((d) {
              final dateStr = _formatSlotDate(d);
              final isSelected = _selectedSlotDate != null &&
                  _formatSlotDate(_selectedSlotDate!) == dateStr;
              return ChoiceChip(
                label: Text(
                  d.day == DateTime.now().day
                      ? 'Today'
                      : '${d.day}/${d.month}',
                  style: TextStyle(
                    color: isSelected ? Colors.white : Colors.white70,
                    fontSize: 13,
                  ),
                ),
                selected: isSelected,
                onSelected: (_) => _loadSlots(d),
                selectedColor: const Color(0xFF4F46E5),
                backgroundColor: const Color(0xFF1E293B),
              );
            }).toList(),
          ),
          const SizedBox(height: 14),
          if (_slotsLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: Color(0xFF4F46E5)),
              ),
            )
          else if (_slotsError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _slotsError!,
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.redAccent),
              ),
            )
          else if (_selectedSlotDate != null && _slots.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'No available slots for this day.',
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.white54),
              ),
            )
          else if (_slots.isNotEmpty)
            ..._slots.map((slot) {
              final start = slot['startTime'] as String? ?? '';
              final end = slot['endTime'] as String? ?? '';
              String label = start;
              if (start.length >= 16) {
                final t = start.substring(11, 16);
                label = t;
              }
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  tileColor: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  title: Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  subtitle: end.isNotEmpty
                      ? Text(
                          'Until ${end.length >= 16 ? end.substring(11, 16) : end}',
                          style: const TextStyle(color: Colors.white54, fontSize: 12),
                        )
                      : null,
                  trailing: _bookingInProgress
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : FilledButton(
                          onPressed: () => _bookSlot(slot),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF4F46E5),
                          ),
                          child: const Text('Book'),
                        ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Future<void> _startAiVoice() async {
    await _voiceClient?.start();
  }

  Future<void> _stopAiVoice() async {
    await _voiceClient?.stop();
  }
}

enum _ChatRole { visitor, assistant }

class _ChatMessage {
  _ChatMessage({
    required this.role,
    required this.text,
    required this.time,
  });

  final _ChatRole role;
  final String text;
  final DateTime time;
}

class _ChipPill extends StatelessWidget {
  const _ChipPill({
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

