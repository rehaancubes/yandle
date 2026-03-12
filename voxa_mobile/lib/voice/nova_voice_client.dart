import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:http/http.dart' as http;
import 'package:realtime_audio/realtime_audio.dart';
import 'package:socket_io_client_flutter/socket_io_client_flutter.dart'
    as IO;

import '../api_config.dart';

enum NovaVoiceStatus { idle, connecting, ready, live, error }

class NovaVoiceClient extends ChangeNotifier {
  NovaVoiceClient({required this.handle, this.callerName});

  final String handle;
  final String? callerName;

  NovaVoiceStatus status = NovaVoiceStatus.idle;
  String? error;

  IO.Socket? _socket;
  RealtimeAudio? _audio;
  StreamSubscription<Uint8List>? _recorderSub;
  Timer? _initTimeout;

  bool get isLive => status == NovaVoiceStatus.live;

  Future<void> start() async {
    if (status == NovaVoiceStatus.connecting || status == NovaVoiceStatus.live) {
      return;
    }
    status = NovaVoiceStatus.connecting;
    error = null;
    notifyListeners();

    try {
      // 0) Request mic permission first (required on iOS before any audio access)
      final permission = await RealtimeAudio.requestRecordPermission();
      if (permission != RealtimeAudioRecordPermission.granted) {
        throw Exception('Microphone permission is required for voice');
      }

      // 1) Get Sonic config + session from backend
      final configResp =
          await http.get(Uri.parse('$apiBase/sonic/config')).timeout(
        const Duration(seconds: 8),
      );
      if (configResp.statusCode != 200) {
        throw Exception('sonic/config failed (${configResp.statusCode})');
      }
      final config =
          json.decode(configResp.body) as Map<String, dynamic>? ?? {};

      final sessionResp = await http
          .post(
            Uri.parse('$apiBase/sonic/session'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'handle': handle}),
          )
          .timeout(const Duration(seconds: 8));
      if (sessionResp.statusCode != 200) {
        throw Exception('sonic/session failed (${sessionResp.statusCode})');
      }
      final session =
          json.decode(sessionResp.body) as Map<String, dynamic>? ?? {};

      final sonicServiceUrl =
          (session['sonicServiceUrl'] as String?) ??
              (config['sonicServiceUrl'] as String?) ??
              '';
      if (sonicServiceUrl.isEmpty) {
        throw Exception('Sonic service URL not available');
      }
      final region =
          (config['region'] as String?) ?? (config['bedrockRegion'] as String?) ??
              'us-east-1';

      // 2) Prepare realtime audio engine for mic + playback
      // Note: In debug you may see "Echo: Audio engine configuration changed, need to restart. false"
      // when iOS reports a route/session change; the plugin restarts the engine. Safe to ignore.
      _audio = RealtimeAudio(
        recorderEnabled: true,
        recorderSampleRate: 16000,
        playerSampleRate: 24000,
        recorderChunkInterval: 40,
      );
      await _audio!.isInitialized;

      // 3) Connect Socket.IO to Sonic service
      final opts = IO.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/socket.io/')
          .disableAutoConnect()
          .build();
      _socket = IO.io(sonicServiceUrl, opts);

      _socket!.onConnect((_) {
        status = NovaVoiceStatus.ready;
        notifyListeners();

        // Match web: wait for initializeConnection ack before promptStart/audioStart
        void onInitDone() {
          _initTimeout?.cancel();
          _initTimeout = null;
          _socket?.emit('promptStart', {
            'voiceId': 'tiffany',
            'outputSampleRate': 24000,
          });
          final systemPrompt = [
            'Always respond in English.',
            'You are a real-time Nova Sonic voice assistant for this Voxa business handle: $handle.',
            'Be concise, friendly, and helpful. You can answer questions about services, timings, pricing, and availability.',
            'If the caller wants to book, collect their name and phone number and confirm back clearly.',
          ].join('\n');
          _socket?.emit('systemPrompt', {
            'content': systemPrompt,
            'voiceId': 'tiffany',
          });
          _socket?.emit('audioStart');
        }

        _initTimeout = Timer(const Duration(seconds: 15), () {
          if (_socket?.connected == true && status == NovaVoiceStatus.ready) {
            error = 'Connection timeout';
            status = NovaVoiceStatus.error;
            notifyListeners();
            _socket?.disconnect();
          }
        });

        _socket!.emitWithAck(
          'initializeConnection',
          {
            'region': region,
            'handle': handle,
            if (callerName != null) 'callerName': callerName,
            'inferenceConfig': {
              'maxTokens': 2048,
              'temperature': 0.7,
              'topP': 0.9,
            },
            'turnDetectionConfig': {
              'endpointingSensitivity': 'MEDIUM',
            },
          },
          ack: (dynamic ackData) {
            _initTimeout?.cancel();
            _initTimeout = null;
            final map = ackData is List && ackData.isNotEmpty
                ? ackData.first
                : ackData;
            if (map is Map && map['success'] == true) {
              onInitDone();
            } else {
              error = (map is Map ? map['error']?.toString() : null) ?? 'Connection failed';
              status = NovaVoiceStatus.error;
              notifyListeners();
            }
          },
        );
      });

      _socket!.on('audioReady', (_) {
        status = NovaVoiceStatus.live;
        notifyListeners();
        // Run on main isolate so native audio runs on main thread (avoids iOS crash)
        SchedulerBinding.instance.addPostFrameCallback((_) {
          _startMic();
        });
      });

      _socket!.on('audioOutput', (dynamic data) async {
        try {
          if (data is Map && data['content'] is String) {
            final base64 = data['content'] as String;
            if (base64.isEmpty) return;
            final bytes = base64Decode(base64);
            await _audio?.queueChunk(Uint8List.fromList(bytes));
          }
        } catch (_) {
          // ignore individual chunk errors
        }
      });

      _socket!.on('error', (dynamic data) {
        error = data?.toString();
        status = NovaVoiceStatus.error;
        notifyListeners();
      });

      _socket!.onDisconnect((_) {
        if (status != NovaVoiceStatus.error) {
          status = NovaVoiceStatus.idle;
        }
        notifyListeners();
      });

      _socket!.connect();
    } catch (e) {
      error = e.toString();
      status = NovaVoiceStatus.error;
      notifyListeners();
      await stop();
    }
  }

  Future<void> _startMic() async {
    try {
      final permission = await RealtimeAudio.requestRecordPermission();
      if (permission != RealtimeAudioRecordPermission.granted) {
        throw Exception('Microphone permission not granted');
      }

      await _audio?.start();

      _recorderSub = _audio?.recorderStream.listen((Uint8List samples) {
        if (_socket?.connected != true ||
            status != NovaVoiceStatus.live ||
            samples.isEmpty) {
          return;
        }
        final b64 = base64Encode(samples);
        _socket!.emit('audioInput', b64);
      });
    } catch (e) {
      error = 'Mic error: $e';
      status = NovaVoiceStatus.error;
      notifyListeners();
    }
  }

  Future<void> stop() async {
    _initTimeout?.cancel();
    _initTimeout = null;
    try {
      await _recorderSub?.cancel();
      _recorderSub = null;
    } catch (_) {}

    try {
      _socket?.emit('stopAudio');
      _socket?.dispose();
    } catch (_) {}
    _socket = null;

    try {
      if (_audio != null) {
        await _audio!.stop();
        await _audio!.dispose();
      }
    } catch (_) {}
    _audio = null;

    status = NovaVoiceStatus.idle;
    notifyListeners();
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

