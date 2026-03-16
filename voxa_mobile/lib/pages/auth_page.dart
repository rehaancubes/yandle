import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import '../services/auth_service.dart';
import '../voxa_shell.dart';

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  // 'phone' | 'phone-otp' | 'email' | 'email-otp'
  String _screen = 'phone';

  bool _loading = false;
  String _error = '';
  String _verificationId = '';
  int? _resendToken;

  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  void _clearError() => setState(() => _error = '');
  void _setError(String e) => setState(() => _error = e);

  void _goToShell() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const YandleShell()),
    );
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: const Color(0xFF4F46E5),
      ),
    );
  }

  // ─── Phone auth (per Firebase docs: verifyPhoneNumber + 4 callbacks) ───────────

  /// Ensure phone has + prefix for E.164 (e.g. +44 7123 123 456).
  String _normalizePhone(String input) {
    final s = input.trim();
    if (s.isEmpty) return s;
    return s.startsWith('+') ? s : '+$s';
  }

  Future<void> _sendPhoneOtp() async {
    final phone = _normalizePhone(_phoneCtrl.text);
    if (phone.isEmpty || phone.length < 8) {
      _setError('Enter a valid phone number with country code.');
      return;
    }
    _clearError();
    setState(() => _loading = true);

    try {
      await AuthService.verifyPhoneNumber(
        phoneNumber: phone,
        forceResendingToken: _resendToken,
        onCodeSent: (String verificationId, int? resendToken) {
          if (!mounted) return;
          _verificationId = verificationId;
          _resendToken = resendToken;
          _otpCtrl.clear();
          setState(() {
            _loading = false;
            _screen = 'phone-otp';
          });
          _snack('Code sent to $phone');
        },
        onVerificationFailed: (String message) {
          if (!mounted) return;
          setState(() => _loading = false);
          _setError(message);
        },
        onVerificationCompleted: (fb.PhoneAuthCredential credential) async {
          // Android only: auto SMS resolution
          if (!mounted) return;
          setState(() => _loading = true);
          final res = await AuthService.signInWithPhoneCredentialDirect(credential);
          if (!mounted) return;
          setState(() => _loading = false);
          if (res.ok) {
            _snack('Welcome!');
            _goToShell();
          } else {
            _setError(res.error ?? 'Verification failed.');
          }
        },
        onCodeAutoRetrievalTimeout: (String verificationId) {
          // User must enter code manually
        },
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _setError(e.toString());
    }
  }

  Future<void> _verifyPhoneOtp() async {
    final smsCode = _otpCtrl.text.trim();
    if (smsCode.length < 6) return;
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.signInWithPhoneCredential(
      verificationId: _verificationId,
      smsCode: smsCode,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _snack('Welcome!');
      _goToShell();
    } else {
      _setError(res.error ?? 'Verification failed.');
    }
  }

  // ─── Email OTP handlers ─────────────────────────────────────────────────────

  Future<void> _sendEmailOtp() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      _setError('Enter a valid email address.');
      return;
    }
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.sendEmailOtp(email);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _otpCtrl.clear();
      setState(() => _screen = 'email-otp');
      _snack('Code sent to $email');
    } else {
      _setError(res.error ?? 'Could not send code.');
    }
  }

  Future<void> _verifyEmailOtp() async {
    final otp = _otpCtrl.text.trim();
    if (otp.length < 6) return;
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.verifyEmailOtp(
        _emailCtrl.text.trim(), otp);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _snack('Welcome to Yandle!');
      _goToShell();
    } else {
      _setError(res.error ?? 'Verification failed.');
    }
  }

  Future<void> _resendEmailOtp() async {
    setState(() => _loading = true);
    _clearError();
    final res = await AuthService.sendEmailOtp(_emailCtrl.text.trim());
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _snack('Code resent — check your inbox.');
    } else {
      _setError(res.error ?? 'Could not resend code.');
    }
  }

  // ─── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final card = switch (_screen) {
      'phone' => _phoneCard(),
      'phone-otp' => _phoneOtpCard(),
      'email' => _emailCard(),
      'email-otp' => _emailOtpCard(),
      _ => _phoneCard(),
    };
    return _Wrapper(child: card);
  }

  // ─── Cards ────────────────────────────────────────────────────────────────────

  Widget _phoneCard() {
    return _Card(children: [
      Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: const Color(0xFF4F46E5),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(
            Icons.spatial_audio_off_rounded,
            color: Colors.white,
            size: 20,
          ),
        ),
        const SizedBox(width: 10),
        const Text(
          'Yandle',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ]),
      const SizedBox(height: 24),
      const Text(
        'Sign in with phone',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        "We'll send a verification code to your phone number",
        style: TextStyle(color: Colors.white54, fontSize: 13),
      ),
      const SizedBox(height: 20),
      _ErrorText(_error),
      _Field(
        ctrl: _phoneCtrl,
        label: 'Phone number',
        hint: '+91 98765 43210',
        type: TextInputType.phone,
        autofocus: true,
        onSubmitted: _sendPhoneOtp,
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
        label: 'Send OTP',
        loading: _loading,
        onPressed: _sendPhoneOtp,
      ),
      const SizedBox(height: 16),
      Center(
        child: TextButton(
          onPressed: () => setState(() {
            _screen = 'email';
            _clearError();
          }),
          child: const Text(
            'Sign in with email instead',
            style: TextStyle(color: Colors.white54, fontSize: 13),
          ),
        ),
      ),
    ]);
  }

  Widget _phoneOtpCard() {
    return _Card(children: [
      _BackBtn(() {
        setState(() {
          _screen = 'phone';
          _otpCtrl.clear();
          _clearError();
        });
      }),
      const SizedBox(height: 12),
      const Text(
        'Verify your phone',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        'Enter the 6-digit code sent to ${_phoneCtrl.text}',
        style: const TextStyle(color: Colors.white54, fontSize: 13),
      ),
      const SizedBox(height: 20),
      _ErrorText(_error),
      _OtpField(
        ctrl: _otpCtrl,
        onChanged: () => setState(() {}),
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
        label: 'Verify',
        loading: _loading,
        onPressed: _verifyPhoneOtp,
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: _loading ? null : _sendPhoneOtp,
        child: const Text(
          'Resend code',
          style: TextStyle(color: Colors.white54, fontSize: 13),
        ),
      ),
    ]);
  }

  Widget _emailCard() {
    return _Card(children: [
      _BackBtn(() {
        setState(() {
          _screen = 'phone';
          _clearError();
        });
      }),
      const SizedBox(height: 12),
      Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: const Color(0xFF4F46E5),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(
            Icons.spatial_audio_off_rounded,
            color: Colors.white,
            size: 20,
          ),
        ),
        const SizedBox(width: 10),
        const Text(
          'Yandle',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ]),
      const SizedBox(height: 20),
      const Text(
        'Sign in with email',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        "We'll send a verification code to your email. No password needed.",
        style: TextStyle(color: Colors.white54, fontSize: 13),
      ),
      const SizedBox(height: 20),
      _ErrorText(_error),
      _Field(
        ctrl: _emailCtrl,
        label: 'Email',
        hint: 'you@example.com',
        type: TextInputType.emailAddress,
        autofocus: true,
        onSubmitted: _sendEmailOtp,
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
        label: 'Send Code',
        loading: _loading,
        onPressed: _sendEmailOtp,
      ),
    ]);
  }

  Widget _emailOtpCard() {
    return _Card(children: [
      _BackBtn(() {
        setState(() {
          _screen = 'email';
          _otpCtrl.clear();
          _clearError();
        });
      }),
      const SizedBox(height: 12),
      const Text(
        'Check your email',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        'Enter the 6-digit code sent to ${_emailCtrl.text}',
        style: const TextStyle(color: Colors.white54, fontSize: 13),
      ),
      const SizedBox(height: 20),
      _ErrorText(_error),
      _OtpField(
        ctrl: _otpCtrl,
        onChanged: () => setState(() {}),
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
        label: 'Verify',
        loading: _loading,
        onPressed: _verifyEmailOtp,
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: _loading ? null : _resendEmailOtp,
        child: const Text(
          'Resend code',
          style: TextStyle(color: Colors.white54, fontSize: 13),
        ),
      ),
    ]);
  }
}

// ─── Reusable sub-widgets ─────────────────────────────────────────────────────

class _Wrapper extends StatelessWidget {
  final Widget child;
  const _Wrapper({required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF020617), Color(0xFF111827)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: children,
      ),
    );
  }
}

class _ErrorText extends StatelessWidget {
  final String error;
  const _ErrorText(this.error);

  @override
  Widget build(BuildContext context) {
    if (error.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        error,
        style:
            const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController ctrl;
  final String label;
  final String hint;
  final TextInputType type;
  final bool obscure;
  final bool autofocus;
  final Widget? suffix;
  final void Function()? onSubmitted;

  const _Field({
    required this.ctrl,
    required this.label,
    required this.hint,
    this.type = TextInputType.text,
    this.obscure = false,
    this.autofocus = false,
    this.suffix,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          obscureText: obscure,
          keyboardType: type,
          autofocus: autofocus,
          textInputAction: onSubmitted != null
              ? TextInputAction.done
              : TextInputAction.next,
          onSubmitted:
              onSubmitted != null ? (_) => onSubmitted!() : null,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle:
                const TextStyle(color: Colors.white38),
            suffixIcon: suffix,
            filled: true,
            fillColor: const Color(0xFF0F172A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide:
                  const BorderSide(color: Color(0xFF4F46E5)),
            ),
            contentPadding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 14),
          ),
        ),
      ],
    );
  }
}

class _OtpField extends StatelessWidget {
  final TextEditingController ctrl;
  final VoidCallback onChanged;

  const _OtpField(
      {required this.ctrl, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'Verification Code',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly
          ],
          maxLength: 6,
          autofocus: true,
          onChanged: (_) => onChanged(),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 22,
            letterSpacing: 10,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            hintText: '------',
            hintStyle: const TextStyle(
              color: Colors.white38,
              letterSpacing: 10,
              fontSize: 22,
            ),
            counterText: '',
            filled: true,
            fillColor: const Color(0xFF0F172A),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide:
                  const BorderSide(color: Color(0xFF4F46E5)),
            ),
            contentPadding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 16),
          ),
        ),
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;

  const _PrimaryButton({
    required this.label,
    required this.loading,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4F46E5),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
          disabledBackgroundColor:
              Color(0xFF4F46E5).withValues(alpha: 0.5),
        ),
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
      ),
    );
  }
}

class _BackBtn extends StatelessWidget {
  final VoidCallback onPressed;
  const _BackBtn(this.onPressed);

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.arrow_back,
            size: 16, color: Colors.white54),
        label: const Text(
          'Back',
          style:
              TextStyle(color: Colors.white54, fontSize: 13),
        ),
        style: TextButton.styleFrom(
          padding: EdgeInsets.zero,
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
    );
  }
}
