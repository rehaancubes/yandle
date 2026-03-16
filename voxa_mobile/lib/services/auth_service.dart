// Yandle Auth — Cognito for tokens, Firebase for phone OTP delivery.
// Phone OTP: Firebase Auth verifies SMS → backend exchanges Firebase token for Cognito tokens.
// Email OTP: Cognito ForgotPassword flow (built-in email).

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import '../api_config.dart';

class AuthResult {
  final bool ok;
  final String? error;
  final String? code;

  const AuthResult({
    required this.ok,
    this.error,
    this.code,
  });
}

class AuthService {
  static const _idTokenKey = 'yandle_id_token';
  static const _accessTokenKey = 'yandle_access_token';
  static const _refreshTokenKey = 'yandle_refresh_token';

  // ─── Storage key migration (voxa_ → yandle_) ──────────────────────────────

  static Future<void> migrateStorageKeys() async {
    final prefs = await SharedPreferences.getInstance();
    const migrations = {
      'voxa_id_token': 'yandle_id_token',
      'voxa_access_token': 'yandle_access_token',
      'voxa_refresh_token': 'yandle_refresh_token',
    };
    for (final entry in migrations.entries) {
      final old = prefs.getString(entry.key);
      if (old != null && prefs.getString(entry.value) == null) {
        await prefs.setString(entry.value, old);
      }
      if (old != null) await prefs.remove(entry.key);
    }
  }

  // ─── Cognito HTTP ────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> _cognitoRequest(
    String target,
    Map<String, dynamic> body,
  ) async {
    final res = await http.post(
      Uri.parse(cognitoEndpoint),
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target':
            'AWSCognitoIdentityProviderService.$target',
      },
      body: jsonEncode(body),
    );
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      final msg = data['message'] ??
          data['Message'] ??
          data['__type'] ??
          'Cognito error ${res.statusCode}';
      throw _CognitoError(
        msg.toString(),
        (data['__type'] ?? '').toString(),
      );
    }
    return data;
  }

  // ─── JWT helpers ─────────────────────────────────────────────────────────────

  static Map<String, dynamic>? _decodeJwtPayload(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      var b64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
      b64 = b64.padRight((b64.length + 3) ~/ 4 * 4, '=');
      return jsonDecode(utf8.decode(base64.decode(b64)))
          as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static const _refreshThresholdSeconds = 5 * 60;

  static Future<bool> isAuthenticated() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_idTokenKey);
    if (token == null) return false;
    final payload = _decodeJwtPayload(token);
    if (payload == null) return false;
    final exp = (payload['exp'] as num?)?.toInt() ?? 0;
    if ((exp * 1000) > DateTime.now().millisecondsSinceEpoch) return true;
    final refreshed = await _refreshTokens();
    return refreshed;
  }

  static Future<String?> getIdToken() async {
    final prefs = await SharedPreferences.getInstance();
    String? token = prefs.getString(_idTokenKey);
    if (token == null) return null;
    final payload = _decodeJwtPayload(token);
    if (payload != null) {
      final exp = (payload['exp'] as num?)?.toInt() ?? 0;
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      if (exp > 0 && nowSec >= exp - _refreshThresholdSeconds) {
        final ok = await _refreshTokens();
        if (ok) token = prefs.getString(_idTokenKey);
      }
    }
    return token;
  }

  static Future<String?> getCurrentUserSub() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_idTokenKey);
    if (token == null) return null;
    final payload = _decodeJwtPayload(token);
    return payload?['sub'] as String?;
  }

  static Future<String?> getCurrentUserEmail() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_idTokenKey);
    if (token == null) return null;
    final payload = _decodeJwtPayload(token);
    return payload?['email'] as String?;
  }

  // ─── Email OTP auth ────────────────────────────────────────────────────────

  /// Start email OTP flow. Sends code via Cognito built-in email.
  static Future<PhoneAuthResult> sendEmailOtp(String email) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/email'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email.trim().toLowerCase(),
          'action': 'email-start',
        }),
      );
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        return PhoneAuthResult(
          ok: false,
          error: data['error']?.toString() ?? 'Failed to send code',
        );
      }
      return const PhoneAuthResult(ok: true);
    } catch (e) {
      return PhoneAuthResult(ok: false, error: e.toString());
    }
  }

  /// Verify email OTP and get tokens.
  static Future<AuthResult> verifyEmailOtp(String email, String otp) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/email'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email.trim().toLowerCase(),
          'action': 'email-verify',
          'otp': otp.trim(),
        }),
      );
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        return AuthResult(
          ok: false,
          error: data['error']?.toString() ?? 'Verification failed',
        );
      }
      final idToken = data['idToken'] as String?;
      if (idToken == null) {
        return const AuthResult(ok: false, error: 'No token in response.');
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_idTokenKey, idToken);
      final accessToken = data['accessToken'] as String?;
      if (accessToken != null) {
        await prefs.setString(_accessTokenKey, accessToken);
      }
      final refreshToken = data['refreshToken'] as String?;
      if (refreshToken != null) {
        await prefs.setString(_refreshTokenKey, refreshToken);
      }
      return const AuthResult(ok: true);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  // ─── Phone auth (Firebase) — https://firebase.google.com/docs/auth/flutter/phone-auth ───

  /// Call Firebase verifyPhoneNumber with the 4 required callbacks per the docs.
  /// [phoneNumber] must include country code (e.g. '+44 7123 123 456').
  /// [forceResendingToken] from a previous codeSent callback to force resend SMS.
  static Future<void> verifyPhoneNumber({
    required String phoneNumber,
    int? forceResendingToken,
    required void Function(String verificationId, int? resendToken) onCodeSent,
    required void Function(String message) onVerificationFailed,
    void Function(fb.PhoneAuthCredential credential)? onVerificationCompleted,
    void Function(String verificationId)? onCodeAutoRetrievalTimeout,
  }) async {
    final auth = fb.FirebaseAuth.instance;
    await auth.verifyPhoneNumber(
      phoneNumber: phoneNumber.trim(),
      timeout: const Duration(seconds: 60),
      forceResendingToken: forceResendingToken,
      verificationCompleted: (fb.PhoneAuthCredential credential) {
        onVerificationCompleted?.call(credential);
      },
      verificationFailed: (fb.FirebaseAuthException e) {
        if (e.code == 'invalid-phone-number') {
          onVerificationFailed('The provided phone number is not valid.');
        } else {
          onVerificationFailed(e.message ?? 'Verification failed.');
        }
      },
      codeSent: (String verificationId, int? resendToken) {
        onCodeSent(verificationId, resendToken);
      },
      codeAutoRetrievalTimeout: (String verificationId) {
        onCodeAutoRetrievalTimeout?.call(verificationId);
      },
    );
  }

  /// Create credential from SMS code and sign in (per docs: PhoneAuthProvider.credential + signInWithCredential).
  /// Then exchange Firebase ID token for Cognito tokens via backend.
  static Future<AuthResult> signInWithPhoneCredential({
    required String verificationId,
    required String smsCode,
  }) async {
    try {
      final credential = fb.PhoneAuthProvider.credential(
        verificationId: verificationId,
        smsCode: smsCode.trim(),
      );
      return await _exchangeFirebaseCredential(credential);
    } on fb.FirebaseAuthException catch (e) {
      if (e.code == 'invalid-verification-code') {
        return const AuthResult(ok: false, error: 'Incorrect verification code.');
      }
      return AuthResult(ok: false, error: e.message ?? 'Verification failed.');
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  /// Sign in with auto-retrieved credential (Android only, from verificationCompleted).
  static Future<AuthResult> signInWithPhoneCredentialDirect(
    fb.PhoneAuthCredential credential,
  ) async {
    try {
      return await _exchangeFirebaseCredential(credential);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  /// Sign in with Firebase credential, get Firebase ID token,
  /// exchange it for Cognito tokens via backend, then sign out of Firebase.
  static Future<AuthResult> _exchangeFirebaseCredential(
    fb.AuthCredential credential,
  ) async {
    final userCredential =
        await fb.FirebaseAuth.instance.signInWithCredential(credential);
    final firebaseIdToken = await userCredential.user?.getIdToken();
    if (firebaseIdToken == null) {
      return const AuthResult(ok: false, error: 'Failed to get Firebase token.');
    }

    // Exchange Firebase token for Cognito tokens
    final res = await http.post(
      Uri.parse('$apiBase/auth/phone'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'action': 'firebase-verify',
        'firebaseToken': firebaseIdToken,
      }),
    );
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      return AuthResult(
        ok: false,
        error: data['error']?.toString() ?? 'Verification failed',
      );
    }

    // Store Cognito tokens
    final idToken = data['idToken'] as String?;
    if (idToken == null) {
      return const AuthResult(ok: false, error: 'No token in response.');
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_idTokenKey, idToken);
    final accessToken = data['accessToken'] as String?;
    if (accessToken != null) await prefs.setString(_accessTokenKey, accessToken);
    final refreshToken = data['refreshToken'] as String?;
    if (refreshToken != null) await prefs.setString(_refreshTokenKey, refreshToken);

    // Sign out of Firebase — we only needed it for OTP, Cognito owns the session
    await fb.FirebaseAuth.instance.signOut();

    return const AuthResult(ok: true);
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  /// Link a real email address to a phone-auth account.
  static Future<AuthResult> linkEmail(String email) async {
    try {
      final token = await getIdToken();
      if (token == null) {
        return const AuthResult(ok: false, error: 'Not authenticated.');
      }
      final res = await http.put(
        Uri.parse('$apiBase/auth/profile'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'action': 'link-email',
          'email': email.trim().toLowerCase(),
        }),
      );
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        return AuthResult(
          ok: false,
          error: data['error']?.toString() ?? 'Failed to link email',
        );
      }
      await _refreshTokens();
      return const AuthResult(ok: true);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  /// Refresh tokens using the stored refresh token.
  static Future<bool> _refreshTokens() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final refreshToken = prefs.getString(_refreshTokenKey);
      if (refreshToken == null) return false;
      final data = await _cognitoRequest('InitiateAuth', {
        'AuthFlow': 'REFRESH_TOKEN_AUTH',
        'ClientId': cognitoClientId,
        'AuthParameters': {
          'REFRESH_TOKEN': refreshToken,
        },
      });
      final result = data['AuthenticationResult'] as Map<String, dynamic>?;
      if (result == null) return false;
      final idToken = result['IdToken'] as String?;
      if (idToken != null) await prefs.setString(_idTokenKey, idToken);
      final accessToken = result['AccessToken'] as String?;
      if (accessToken != null) await prefs.setString(_accessTokenKey, accessToken);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Check if the current user signed in via phone (synthetic email).
  static Future<bool> isPhoneAuthUser() async {
    final email = await getCurrentUserEmail();
    return email != null &&
        (email.endsWith('@phone.yandle.local') || email.endsWith('@phone.voxa.local'));
  }

  /// Get the phone number from JWT claims (for phone-auth users).
  static Future<String?> getCurrentUserPhone() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_idTokenKey);
    if (token == null) return null;
    final payload = _decodeJwtPayload(token);
    return payload?['phone_number'] as String?;
  }

  static Future<void> signOut() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_idTokenKey);
    await prefs.remove(_accessTokenKey);
    await prefs.remove(_refreshTokenKey);
  }
}

class PhoneAuthResult {
  final bool ok;
  final String? error;

  const PhoneAuthResult({required this.ok, this.error});
}

class _CognitoError implements Exception {
  final String message;
  final String code;
  const _CognitoError(this.message, this.code);
}
