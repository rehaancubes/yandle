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

  @override
  State<BusinessDetailPage> createState() => _BusinessDetailPageState();
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

  NovaVoiceClient? _voiceClient;

  String? _sessionId;
  bool _isSending = false;
  final TextEditingController _chatController = TextEditingController();
  final List<_ChatMessage> _messages = [];

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

      setState(() {
        _resolvedDisplayName ??=
            profile['displayName'] as String? ?? widget.handle;
        _resolvedBusinessName ??=
            profile['businessName'] as String? ?? _resolvedDisplayName;
        _resolvedAddress ??= profile['address'] as String?;
        _resolvedCity ??= profile['city'] as String?;
        _resolvedPhone ??= profile['phoneNumber'] as String?;
        _resolvedHasAiPhone =
            (profile['hasAiPhone'] as bool?) ?? _resolvedHasAiPhone;
        final ra = profile['realtimeAvailability'] as Map<String, dynamic>?;
        if (ra != null) {
          _resolvedHasWalkIn =
              (ra['hasWalkInSlots'] as bool?) ?? _resolvedHasWalkIn;
          _resolvedSupportsUrgent =
              (ra['supportsUrgentCases'] as bool?) ?? _resolvedSupportsUrgent;
        }
      });

      // Seed intro chat message once we have a name.
      if (_messages.isEmpty) {
        final who = _resolvedBusinessName ?? _resolvedDisplayName;
        _messages.add(
          _ChatMessage(
            role: _ChatRole.assistant,
            text:
                'Hey, I am $who\'s Yandle assistant. Ask me anything about services, pricing, or availability.',
            time: DateTime.now(),
          ),
        );
      }
    } catch (_) {
      setState(() {
        _profileError = 'Could not load profile.';
      });
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name =
        _resolvedBusinessName ?? _resolvedDisplayName ?? widget.handle;

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: const Color(0xFF020617),
        appBar: AppBar(
          title: Text(name),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Chat'),
              Tab(text: 'Voice'),
            ],
          ),
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
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
                    const SizedBox(height: 4),
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
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: -4,
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
            ),
            const Divider(height: 1, color: Color(0xFF1E293B)),
            Expanded(
              child: TabBarView(
                children: [
                  _buildChatTab(theme),
                  _buildVoiceTab(theme),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChatTab(ThemeData theme) {
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
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
                        : const Color(0xFF020617),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isVisitor
                          ? const Color(0xFF4F46E5).withValues(alpha: 0.5)
                          : const Color(0xFF1E293B),
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
        const Divider(height: 1, color: Color(0xFF1E293B)),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _chatController,
                  style: const TextStyle(color: Colors.white),
                  cursorColor: Colors.white70,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendChat(),
                  decoration: const InputDecoration(
                    hintText: 'Ask about services, pricing, or timing…',
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
        ),
      ],
    );
  }

  Widget _buildVoiceTab(ThemeData theme) {
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
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                height: 56,
                width: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF4F46E5).withValues(alpha: 0.18),
                ),
                child: const Icon(
                  Icons.waves_rounded,
                  color: Color(0xFF4F46E5),
                  size: 30,
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
                    const SizedBox(height: 4),
                    Text(
                      'Start a real-time Nova Sonic voice call with this business—same as the Yandle web portal.',
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
            const SizedBox(height: 12),
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
          const SizedBox(height: 16),
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
            const SizedBox(height: 12),
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

