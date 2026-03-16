import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';

import '../api_config.dart';
import '../services/auth_service.dart';

class AdminConversationsPage extends StatefulWidget {
  final String handle;
  final Color themeColor;
  const AdminConversationsPage({
    super.key,
    required this.handle,
    this.themeColor = const Color(0xFF4F46E5),
  });

  @override
  State<AdminConversationsPage> createState() => _AdminConversationsPageState();
}

class _AdminConversationsPageState extends State<AdminConversationsPage> {
  List<_Conversation> _conversations = [];
  bool _loading = true;
  String? _error;
  String? _expandedSessionId;
  List<_Message> _expandedMessages = [];
  bool _loadingMessages = false;
  String? _playingUrl;

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
      if (token == null) throw Exception('Not authenticated');
      final res = await http.get(
        Uri.parse('$apiBase/public/${widget.handle}/conversations?limit=50'),
        headers: {'authorization': 'Bearer $token'},
      );
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final sessions = (data['sessions'] as List<dynamic>? ?? []);
      if (!mounted) return;
      setState(() {
        _conversations = sessions
            .map((s) => _Conversation.fromJson(s as Map<String, dynamic>))
            .toList();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMessages(String sessionId) async {
    setState(() {
      _loadingMessages = true;
      _expandedMessages = [];
    });
    try {
      final token = await AuthService.getIdToken();
      final res = await http.get(
        Uri.parse('$apiBase/session/$sessionId/messages'),
        headers: {'authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final msgs = (data['messages'] as List<dynamic>? ?? []);
        if (mounted) {
          setState(() {
            _expandedMessages = msgs
                .map((m) => _Message.fromJson(m as Map<String, dynamic>))
                .toList();
          });
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingMessages = false);
  }

  String _timeAgo(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} hr ago';
    return '${diff.inDays} days ago';
  }

  String _formatMsgTime(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    final local = d.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m';
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
              child: Text(
                'Conversations',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
              ),
            ),
            if (_loading)
               Expanded(
                child: Center(
                  child:
                      CircularProgressIndicator(color: widget.themeColor),
                ),
              )
            else if (_error != null)
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!,
                          style: const TextStyle(color: Colors.redAccent)),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              )
            else if (_conversations.isEmpty)
              const Expanded(
                child: Center(
                  child: Text('No conversations yet',
                      style: TextStyle(color: Colors.white54)),
                ),
              )
            else
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    itemCount: _conversations.length,
                    itemBuilder: (ctx, idx) {
                      final c = _conversations[idx];
                      final isExpanded =
                          _expandedSessionId == c.sessionId;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isExpanded
                                ? widget.themeColor
                                    .withValues(alpha: 0.5)
                                : const Color(0xFF1E293B),
                          ),
                        ),
                        child: Column(
                          children: [
                            InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: () {
                                if (isExpanded) {
                                  setState(() {
                                    _expandedSessionId = null;
                                    _expandedMessages = [];
                                  });
                                } else {
                                  setState(
                                      () => _expandedSessionId = c.sessionId);
                                  _loadMessages(c.sessionId);
                                }
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 36,
                                      height: 36,
                                      decoration: BoxDecoration(
                                        color: c.channel == 'voice'
                                            ? const Color(0xFF22C55E)
                                                .withValues(alpha: 0.15)
                                            : widget.themeColor
                                                .withValues(alpha: 0.15),
                                        borderRadius:
                                            BorderRadius.circular(8),
                                      ),
                                      child: Icon(
                                        c.channel == 'voice'
                                            ? Icons.phone_rounded
                                            : Icons.chat_bubble_outline_rounded,
                                        color: c.channel == 'voice'
                                            ? const Color(0xFF22C55E)
                                            : widget.themeColor,
                                        size: 18,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            c.callerName ?? 'Unknown caller',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w600,
                                              fontSize: 13,
                                            ),
                                          ),
                                          if (c.preview.isNotEmpty)
                                            Text(
                                              c.preview,
                                              maxLines: 1,
                                              overflow:
                                                  TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                color: Colors.white54,
                                                fontSize: 12,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                    Text(
                                      _timeAgo(c.createdAt),
                                      style: const TextStyle(
                                          color: Colors.white38,
                                          fontSize: 11),
                                    ),
                                    const SizedBox(width: 4),
                                    Icon(
                                      isExpanded
                                          ? Icons.expand_less
                                          : Icons.expand_more,
                                      color: Colors.white38,
                                      size: 20,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (isExpanded)
                              Container(
                                padding: const EdgeInsets.fromLTRB(
                                    14, 0, 14, 14),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Divider(
                                        color: Color(0xFF1E293B),
                                        height: 1),
                                    const SizedBox(height: 10),
                                    if (c.recordingUrl != null) ...[
                                      _AudioPlayerWidget(
                                          url: c.recordingUrl!,
                                          themeColor: widget.themeColor),
                                      const SizedBox(height: 10),
                                    ],
                                    if (_loadingMessages)
                                       Center(
                                        child: Padding(
                                          padding: EdgeInsets.all(16),
                                          child:
                                              CircularProgressIndicator(
                                            color: widget.themeColor,
                                            strokeWidth: 2,
                                          ),
                                        ),
                                      )
                                    else if (_expandedMessages.isEmpty)
                                      const Text(
                                        'No messages in this session.',
                                        style: TextStyle(
                                            color: Colors.white38,
                                            fontSize: 12),
                                      )
                                    else
                                      ..._expandedMessages.map((m) => Padding(
                                            padding:
                                                const EdgeInsets.only(
                                                    bottom: 8),
                                            child: Row(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment
                                                      .start,
                                              children: [
                                                Container(
                                                  width: 24,
                                                  height: 24,
                                                  decoration: BoxDecoration(
                                                    color: m.role ==
                                                            'assistant'
                                                        ? widget.themeColor
                                                            .withValues(
                                                                alpha:
                                                                    0.2)
                                                        : Colors.white
                                                            .withValues(
                                                                alpha:
                                                                    0.05),
                                                    borderRadius:
                                                        BorderRadius
                                                            .circular(
                                                                6),
                                                  ),
                                                  child: Icon(
                                                    m.role ==
                                                            'assistant'
                                                        ? Icons
                                                            .smart_toy_outlined
                                                        : Icons
                                                            .person_outline,
                                                    size: 14,
                                                    color: m.role ==
                                                            'assistant'
                                                        ? widget.themeColor
                                                        : Colors
                                                            .white54,
                                                  ),
                                                ),
                                                const SizedBox(
                                                    width: 8),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(
                                                        m.content,
                                                        style:
                                                            const TextStyle(
                                                          color: Colors
                                                              .white70,
                                                          fontSize: 12,
                                                          height: 1.4,
                                                        ),
                                                      ),
                                                      if (m.createdAt !=
                                                          null)
                                                        Padding(
                                                          padding:
                                                              const EdgeInsets
                                                                  .only(
                                                                  top: 3),
                                                          child: Text(
                                                            _formatMsgTime(
                                                                m.createdAt!),
                                                            style:
                                                                const TextStyle(
                                                              color: Colors
                                                                  .white24,
                                                              fontSize:
                                                                  10,
                                                            ),
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                ),
                                              ],
                                            ),
                                          )),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Conversation {
  final String sessionId;
  final String? callerName;
  final String channel;
  final String preview;
  final String? createdAt;
  final String? recordingUrl;

  _Conversation({
    required this.sessionId,
    this.callerName,
    required this.channel,
    required this.preview,
    this.createdAt,
    this.recordingUrl,
  });

  factory _Conversation.fromJson(Map<String, dynamic> json) {
    final pk = json['pk'] as String? ?? '';
    return _Conversation(
      sessionId: pk.replaceFirst('SESSION#', ''),
      callerName: json['callerName'] as String? ??
          json['displayName'] as String? ??
          (json['owner'] != 'anonymous' ? json['owner'] as String? : null),
      channel: ((json['channel'] as String?) ?? 'text').toLowerCase(),
      preview: json['lastMessagePreview'] as String? ??
          json['intent'] as String? ??
          '',
      createdAt: json['createdAt'] as String?,
      recordingUrl: json['recordingUrl'] as String?,
    );
  }
}

class _Message {
  final String role;
  final String content;
  final String? createdAt;

  _Message({required this.role, required this.content, this.createdAt});

  factory _Message.fromJson(Map<String, dynamic> json) => _Message(
        role: json['role'] as String? ?? 'user',
        content: json['content'] as String? ?? '',
        createdAt: json['createdAt'] as String?,
      );
}

class _AudioPlayerWidget extends StatefulWidget {
  final String url;
  final Color themeColor;
  const _AudioPlayerWidget({
    required this.url,
    this.themeColor = const Color(0xFF4F46E5),
  });

  @override
  State<_AudioPlayerWidget> createState() => _AudioPlayerWidgetState();
}

class _AudioPlayerWidgetState extends State<_AudioPlayerWidget> {
  late final AudioPlayer _player;
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _player = AudioPlayer();
    _init();
  }

  Future<void> _init() async {
    try {
      final dur = await _player.setUrl(widget.url);
      if (dur != null && mounted) {
        setState(() => _duration = dur);
      }
      _player.positionStream.listen((pos) {
        if (mounted) setState(() => _position = pos);
      });
      _player.durationStream.listen((dur) {
        if (dur != null && mounted) setState(() => _duration = dur);
      });
      _player.playerStateStream.listen((state) {
        if (!mounted) return;
        setState(() {
          _isPlaying = state.playing;
          if (state.processingState == ProcessingState.completed) {
            _isPlaying = false;
            _position = Duration.zero;
            _player.seek(Duration.zero);
            _player.pause();
          }
        });
      });
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) setState(() {
        _error = 'Failed to load audio';
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: Colors.redAccent.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline,
                color: Colors.redAccent, size: 18),
            const SizedBox(width: 8),
            Text(_error!,
                style: const TextStyle(
                    color: Colors.redAccent, fontSize: 12)),
          ],
        ),
      );
    }

    final progress = _duration.inMilliseconds > 0
        ? _position.inMilliseconds / _duration.inMilliseconds
        : 0.0;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: widget.themeColor.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.graphic_eq_rounded,
                  color: widget.themeColor, size: 16),
              const SizedBox(width: 6),
              const Text(
                'Call Recording',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _loading
                  ? SizedBox(
                      width: 36,
                      height: 36,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: CircularProgressIndicator(
                          color: widget.themeColor,
                          strokeWidth: 2,
                        ),
                      ),
                    )
                  : GestureDetector(
                      onTap: () {
                        if (_isPlaying) {
                          _player.pause();
                        } else {
                          _player.play();
                        }
                      },
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: widget.themeColor,
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Icon(
                          _isPlaying
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                    ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GestureDetector(
                      onTapDown: (details) {
                        if (_duration.inMilliseconds <= 0) return;
                        final box =
                            context.findRenderObject() as RenderBox;
                        final localX =
                            details.localPosition.dx;
                        final width = box.size.width - 36 - 12;
                        final pct =
                            (localX / width).clamp(0.0, 1.0);
                        _player.seek(Duration(
                            milliseconds:
                                (pct * _duration.inMilliseconds)
                                    .round()));
                      },
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          value: progress.clamp(0.0, 1.0),
                          backgroundColor: Colors.white
                              .withValues(alpha: 0.08),
                          valueColor:
                              AlwaysStoppedAnimation<Color>(
                                  widget.themeColor),
                          minHeight: 4,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment:
                          MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          _formatDuration(_position),
                          style: const TextStyle(
                            color: Colors.white38,
                            fontSize: 10,
                          ),
                        ),
                        Text(
                          _formatDuration(_duration),
                          style: const TextStyle(
                            color: Colors.white38,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
