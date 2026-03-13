import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../voxa_shell.dart';

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  // 'phone' | 'phone-otp' | 'email' | 'otp' | 'forgot' | 'forgot-otp'
  String _screen = 'phone';

  bool _loading = false;
  bool _showPass = false;
  String _error = '';
  String _phoneSession = ''; // session token from phone OTP start

  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) _clearError();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _confirmPassCtrl.dispose();
    _otpCtrl.dispose();
    _newPassCtrl.dispose();
    super.dispose();
  }

  void _clearError() => setState(() => _error = '');
  void _setError(String e) => setState(() => _error = e);

  void _goToShell() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const VoxaShell()),
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

  // ─── Phone auth handlers ─────────────────────────────────────────────────────

  Future<void> _sendPhoneOtp() async {
    final phone = _phoneCtrl.text.trim();
    if (phone.isEmpty || phone.length < 8) {
      _setError('Enter a valid phone number.');
      return;
    }
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.sendPhoneOtp(phone);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok && res.session != null) {
      _phoneSession = res.session!;
      _otpCtrl.clear();
      setState(() => _screen = 'phone-otp');
      _snack('OTP sent to $phone');
    } else {
      _setError(res.error ?? 'Could not send OTP.');
    }
  }

  Future<void> _verifyPhoneOtp() async {
    final otp = _otpCtrl.text.trim();
    if (otp.length < 6) return;
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.verifyPhoneOtp(
        _phoneCtrl.text.trim(), otp, _phoneSession);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _snack('Welcome to Voxa!');
      _goToShell();
    } else {
      _setError(res.error ?? 'Verification failed.');
    }
  }

  // ─── Email auth handlers ──────────────────────────────────────────────────────

  Future<void> _signIn() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    if (email.isEmpty || pass.isEmpty) return;
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.signIn(email, pass);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _goToShell();
    } else if (res.needsConfirmation) {
      setState(() {
        _screen = 'otp';
        _error = '';
      });
      _snack('Check your email for a verification code.');
    } else {
      _setError(res.error ?? 'Sign in failed.');
    }
  }

  Future<void> _signUp() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    final confirm = _confirmPassCtrl.text;
    if (email.isEmpty || pass.isEmpty) return;
    if (pass != confirm) {
      _setError('Passwords do not match.');
      return;
    }
    if (pass.length < 8) {
      _setError('Password must be at least 8 characters.');
      return;
    }
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.signUp(email, pass);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      setState(() => _screen = 'otp');
      _snack('Check your email — we sent a verification code.');
    } else {
      _setError(res.error ?? 'Sign up failed.');
    }
  }

  Future<void> _verifyOtp() async {
    final otp = _otpCtrl.text.trim();
    if (otp.length < 6) return;
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.confirmSignUp(
        _emailCtrl.text.trim(), otp);
    if (!mounted) return;
    if (res.ok) {
      final loginRes = await AuthService.signIn(
          _emailCtrl.text.trim(), _passCtrl.text);
      if (!mounted) return;
      setState(() => _loading = false);
      if (loginRes.ok) {
        _snack('Email verified! Welcome to Voxa.');
        _goToShell();
      } else {
        _snack('Verified! Please sign in.');
        setState(() {
          _screen = 'email';
          _tabController.index = 0;
        });
      }
    } else {
      setState(() => _loading = false);
      _setError(res.error ?? 'Verification failed.');
    }
  }

  Future<void> _resendOtp() async {
    setState(() => _loading = true);
    final res = await AuthService.resendConfirmationCode(
        _emailCtrl.text.trim());
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _snack('Code resent — check your inbox.');
    } else {
      _setError(res.error ?? 'Could not resend code.');
    }
  }

  Future<void> _sendForgotCode() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return;
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.forgotPassword(email);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      setState(() => _screen = 'forgot-otp');
      _snack('Code sent — check your email.');
    } else {
      _setError(res.error ?? 'Could not send reset code.');
    }
  }

  Future<void> _resetPassword() async {
    final otp = _otpCtrl.text.trim();
    final newPass = _newPassCtrl.text;
    if (otp.isEmpty || newPass.isEmpty) return;
    if (newPass.length < 8) {
      _setError('Password must be at least 8 characters.');
      return;
    }
    _clearError();
    setState(() => _loading = true);
    final res = await AuthService.confirmForgotPassword(
        _emailCtrl.text.trim(), otp, newPass);
    if (!mounted) return;
    setState(() => _loading = false);
    if (res.ok) {
      _snack('Password reset! Please sign in.');
      _otpCtrl.clear();
      _newPassCtrl.clear();
      setState(() {
        _screen = 'email';
        _tabController.index = 0;
      });
    } else {
      _setError(res.error ?? 'Reset failed.');
    }
  }

  // ─── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final card = switch (_screen) {
      'phone' => _phoneCard(),
      'phone-otp' => _phoneOtpCard(),
      'email' => _emailCard(),
      'otp' => _otpCard(),
      'forgot' => _forgotCard(),
      'forgot-otp' => _forgotOtpCard(),
      _ => _phoneCard(),
    };
    return _Wrapper(child: card);
  }

  // ─── Cards ────────────────────────────────────────────────────────────────────

  Widget _phoneCard() {
    return _Card(children: [
      // Logo
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
          'Voxa',
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
      // Logo
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
          'Voxa',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ]),
      const SizedBox(height: 20),
      // Tab bar
      Container(
        height: 40,
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(10),
        ),
        child: TabBar(
          controller: _tabController,
          indicator: BoxDecoration(
            color: const Color(0xFF4F46E5),
            borderRadius: BorderRadius.circular(8),
          ),
          indicatorSize: TabBarIndicatorSize.tab,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
          labelStyle: const TextStyle(
              fontSize: 14, fontWeight: FontWeight.w600),
          dividerColor: Colors.transparent,
          tabs: const [Tab(text: 'Sign In'), Tab(text: 'Sign Up')],
        ),
      ),
      const SizedBox(height: 20),
      // Tab content (animated switch — no fixed height needed)
      ListenableBuilder(
        listenable: _tabController,
        builder: (context, _) => AnimatedSwitcher(
          duration: const Duration(milliseconds: 150),
          child: KeyedSubtree(
            key: ValueKey(_tabController.index),
            child: _tabController.index == 0
                ? _signInForm()
                : _signUpForm(),
          ),
        ),
      ),
    ]);
  }

  Widget _signInForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _ErrorText(_error),
        _Field(
          ctrl: _emailCtrl,
          label: 'Email',
          hint: 'you@example.com',
          type: TextInputType.emailAddress,
        ),
        const SizedBox(height: 12),
        _PassField(
          ctrl: _passCtrl,
          label: 'Password',
          show: _showPass,
          onToggle: () => setState(() => _showPass = !_showPass),
          onSubmitted: _signIn,
        ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => setState(
                () {
                  _screen = 'forgot';
                  _clearError();
                }),
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'Forgot password?',
              style: TextStyle(color: Colors.white54, fontSize: 13),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _PrimaryButton(
            label: 'Sign In',
            loading: _loading,
            onPressed: _signIn),
      ],
    );
  }

  Widget _signUpForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _ErrorText(_error),
        _Field(
          ctrl: _emailCtrl,
          label: 'Email',
          hint: 'you@example.com',
          type: TextInputType.emailAddress,
        ),
        const SizedBox(height: 12),
        _PassField(
          ctrl: _passCtrl,
          label: 'Password',
          show: _showPass,
          onToggle: () => setState(() => _showPass = !_showPass),
        ),
        const SizedBox(height: 4),
        const Text(
          'At least 8 characters',
          style: TextStyle(color: Colors.white38, fontSize: 11),
        ),
        const SizedBox(height: 12),
        _PassField(
          ctrl: _confirmPassCtrl,
          label: 'Confirm Password',
          show: _showPass,
          onToggle: () => setState(() => _showPass = !_showPass),
          onSubmitted: _signUp,
        ),
        const SizedBox(height: 16),
        _PrimaryButton(
            label: 'Create Account',
            loading: _loading,
            onPressed: _signUp),
        const SizedBox(height: 8),
        const Text(
          "We'll send a verification code to your email.",
          style: TextStyle(color: Colors.white38, fontSize: 11),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _otpCard() {
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
        'Verify your email',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        'Enter the 6-digit code sent to ${_emailCtrl.text}',
        style:
            const TextStyle(color: Colors.white54, fontSize: 13),
      ),
      const SizedBox(height: 20),
      _ErrorText(_error),
      _OtpField(
          ctrl: _otpCtrl,
          onChanged: () => setState(() {})),
      const SizedBox(height: 16),
      _PrimaryButton(
          label: 'Verify',
          loading: _loading,
          onPressed: _verifyOtp),
      const SizedBox(height: 8),
      TextButton(
        onPressed: _loading ? null : _resendOtp,
        child: const Text(
          'Resend code',
          style: TextStyle(color: Colors.white54, fontSize: 13),
        ),
      ),
    ]);
  }

  Widget _forgotCard() {
    return _Card(children: [
      _BackBtn(() {
        setState(() {
          _screen = 'email';
          _clearError();
        });
      }),
      const SizedBox(height: 12),
      const Text(
        'Reset password',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        "We'll send a code to your email",
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
        onSubmitted: _sendForgotCode,
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
          label: 'Send code',
          loading: _loading,
          onPressed: _sendForgotCode),
    ]);
  }

  Widget _forgotOtpCard() {
    return _Card(children: [
      const Text(
        'New password',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        'Enter the code sent to ${_emailCtrl.text} and choose a new password',
        style:
            const TextStyle(color: Colors.white54, fontSize: 13),
      ),
      const SizedBox(height: 20),
      _ErrorText(_error),
      _OtpField(ctrl: _otpCtrl, onChanged: () {}),
      const SizedBox(height: 12),
      _PassField(
        ctrl: _newPassCtrl,
        label: 'New password',
        show: _showPass,
        onToggle: () => setState(() => _showPass = !_showPass),
        onSubmitted: _resetPassword,
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
          label: 'Reset password',
          loading: _loading,
          onPressed: _resetPassword),
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

class _PassField extends StatelessWidget {
  final TextEditingController ctrl;
  final String label;
  final bool show;
  final VoidCallback onToggle;
  final void Function()? onSubmitted;

  const _PassField({
    required this.ctrl,
    required this.label,
    required this.show,
    required this.onToggle,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return _Field(
      ctrl: ctrl,
      label: label,
      hint: '••••••••',
      obscure: !show,
      onSubmitted: onSubmitted,
      suffix: IconButton(
        icon: Icon(
          show ? Icons.visibility_off : Icons.visibility,
          color: Colors.white38,
          size: 18,
        ),
        onPressed: onToggle,
      ),
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
