// VOXA Auth — Cognito API via direct HTTP (no hosted UI, no Amplify).
// Mirrors the logic in web/src/lib/auth.ts using USER_PASSWORD_AUTH flow.

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../api_config.dart';

class AuthResult {
  final bool ok;
  final String? error;
  final String? code;
  final bool needsConfirmation;

  const AuthResult({
    required this.ok,
    this.error,
    this.code,
    this.needsConfirmation = false,
  });
}

class AuthService {
  static const _idTokenKey = 'voxa_id_token';
  static const _accessTokenKey = 'voxa_access_token';
  static const _refreshTokenKey = 'voxa_refresh_token';

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

  static Future<bool> isAuthenticated() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_idTokenKey);
    if (token == null) return false;
    final payload = _decodeJwtPayload(token);
    if (payload == null) return false;
    final exp = (payload['exp'] as num?)?.toInt() ?? 0;
    return (exp * 1000) > DateTime.now().millisecondsSinceEpoch;
  }

  static Future<String?> getIdToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_idTokenKey);
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

  // ─── Auth actions ─────────────────────────────────────────────────────────────

  static Future<AuthResult> signUp(
      String email, String password) async {
    try {
      await _cognitoRequest('SignUp', {
        'ClientId': cognitoClientId,
        'Username': email.trim().toLowerCase(),
        'Password': password,
        'UserAttributes': [
          {'Name': 'email', 'Value': email.trim().toLowerCase()},
        ],
      });
      return const AuthResult(ok: true);
    } on _CognitoError catch (e) {
      if (e.code == 'UsernameExistsException') {
        return AuthResult(
          ok: false,
          error: 'An account with this email already exists.',
          code: e.code,
        );
      }
      return AuthResult(ok: false, error: e.message, code: e.code);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  static Future<AuthResult> confirmSignUp(
      String email, String code) async {
    try {
      await _cognitoRequest('ConfirmSignUp', {
        'ClientId': cognitoClientId,
        'Username': email.trim().toLowerCase(),
        'ConfirmationCode': code.trim(),
      });
      return const AuthResult(ok: true);
    } on _CognitoError catch (e) {
      if (e.code == 'CodeMismatchException') {
        return AuthResult(
            ok: false,
            error: 'Incorrect verification code.',
            code: e.code);
      }
      if (e.code == 'ExpiredCodeException') {
        return AuthResult(
            ok: false,
            error: 'Code expired. Please resend.',
            code: e.code);
      }
      return AuthResult(ok: false, error: e.message, code: e.code);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  static Future<AuthResult> resendConfirmationCode(
      String email) async {
    try {
      await _cognitoRequest('ResendConfirmationCode', {
        'ClientId': cognitoClientId,
        'Username': email.trim().toLowerCase(),
      });
      return const AuthResult(ok: true);
    } on _CognitoError catch (e) {
      return AuthResult(ok: false, error: e.message, code: e.code);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  static Future<AuthResult> signIn(
      String email, String password) async {
    try {
      final data = await _cognitoRequest('InitiateAuth', {
        'AuthFlow': 'USER_PASSWORD_AUTH',
        'ClientId': cognitoClientId,
        'AuthParameters': {
          'USERNAME': email.trim().toLowerCase(),
          'PASSWORD': password,
        },
      });
      final result =
          data['AuthenticationResult'] as Map<String, dynamic>?;
      final idToken = result?['IdToken'] as String?;
      if (idToken == null) {
        return const AuthResult(
            ok: false, error: 'No token in response.');
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_idTokenKey, idToken);
      final accessToken = result!['AccessToken'] as String?;
      if (accessToken != null) {
        await prefs.setString(_accessTokenKey, accessToken);
      }
      final refreshToken = result['RefreshToken'] as String?;
      if (refreshToken != null) {
        await prefs.setString(_refreshTokenKey, refreshToken);
      }
      return const AuthResult(ok: true);
    } on _CognitoError catch (e) {
      if (e.code == 'UserNotConfirmedException') {
        return AuthResult(
          ok: false,
          error: 'Please verify your email first.',
          code: e.code,
          needsConfirmation: true,
        );
      }
      if (e.code == 'NotAuthorizedException') {
        return AuthResult(
            ok: false,
            error: 'Incorrect email or password.',
            code: e.code);
      }
      if (e.code == 'UserNotFoundException') {
        return AuthResult(
            ok: false,
            error: 'No account found with this email.',
            code: e.code);
      }
      return AuthResult(ok: false, error: e.message, code: e.code);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  static Future<AuthResult> forgotPassword(String email) async {
    try {
      await _cognitoRequest('ForgotPassword', {
        'ClientId': cognitoClientId,
        'Username': email.trim().toLowerCase(),
      });
      return const AuthResult(ok: true);
    } on _CognitoError catch (e) {
      return AuthResult(ok: false, error: e.message, code: e.code);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  static Future<AuthResult> confirmForgotPassword(
      String email, String code, String newPassword) async {
    try {
      await _cognitoRequest('ConfirmForgotPassword', {
        'ClientId': cognitoClientId,
        'Username': email.trim().toLowerCase(),
        'ConfirmationCode': code.trim(),
        'Password': newPassword,
      });
      return const AuthResult(ok: true);
    } on _CognitoError catch (e) {
      return AuthResult(ok: false, error: e.message, code: e.code);
    } catch (e) {
      return AuthResult(ok: false, error: e.toString());
    }
  }

  // ─── Phone+OTP auth ────────────────────────────────────────────────────────

  /// Start phone OTP flow. Returns a session string needed for verification.
  static Future<PhoneAuthResult> sendPhoneOtp(String phone) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/phone'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone.trim(),
          'action': 'start',
        }),
      );
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        return PhoneAuthResult(
          ok: false,
          error: data['error']?.toString() ?? 'Failed to send OTP',
        );
      }
      return PhoneAuthResult(
        ok: true,
        session: data['session'] as String?,
      );
    } catch (e) {
      return PhoneAuthResult(ok: false, error: e.toString());
    }
  }

  /// Verify phone OTP and get tokens.
  static Future<AuthResult> verifyPhoneOtp(
      String phone, String otp, String session) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/phone'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone.trim(),
          'action': 'verify',
          'otp': otp.trim(),
          'session': session,
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
  final String? session;

  const PhoneAuthResult({required this.ok, this.error, this.session});
}

class _CognitoError implements Exception {
  final String message;
  final String code;
  const _CognitoError(this.message, this.code);
}
