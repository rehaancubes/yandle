import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF020617),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const YandleApp());
}

class YandleApp extends StatelessWidget {
  const YandleApp({super.key});

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFF4F46E5);
    const bg = Color(0xFF020617);
    const surface = Color(0xFF0F172A);
    const border = Color(0xFF1E293B);

    final colorScheme = ColorScheme.fromSeed(
      seedColor: accent,
      brightness: Brightness.dark,
      surface: surface,
      onSurface: Colors.white,
    );

    return MaterialApp(
      title: 'Yandle',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: colorScheme,
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: bg,

        // ── App bar ──────────────────────────────────────────────────────────
        appBarTheme: const AppBarTheme(
          backgroundColor: bg,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          foregroundColor: Colors.white,
          titleTextStyle: TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w600,
          ),
          iconTheme: IconThemeData(color: Colors.white),
        ),

        // ── Bottom navigation ─────────────────────────────────────────────
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: bg,
          surfaceTintColor: Colors.transparent,
          shadowColor: Colors.transparent,
          indicatorColor: const Color(0xFF1D2438),
          height: 62,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return TextStyle(
              color: selected ? accent : Colors.white38,
              fontSize: 11,
              fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
            );
          }),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return IconThemeData(
              color: selected ? accent : Colors.white38,
              size: 22,
            );
          }),
        ),

        // ── Tabs ─────────────────────────────────────────────────────────
        tabBarTheme: const TabBarThemeData(
          indicatorColor: accent,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
          labelStyle:
              TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          unselectedLabelStyle: TextStyle(fontSize: 13),
          dividerColor: border,
        ),

        // ── Dialogs ───────────────────────────────────────────────────────
        dialogTheme: DialogThemeData(
          backgroundColor: const Color(0xFF1E293B),
          surfaceTintColor: Colors.transparent,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          titleTextStyle: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
          contentTextStyle:
              const TextStyle(color: Colors.white70, fontSize: 14),
        ),

        // ── Snack bars ────────────────────────────────────────────────────
        snackBarTheme: SnackBarThemeData(
          backgroundColor: const Color(0xFF1E293B),
          contentTextStyle:
              const TextStyle(color: Colors.white, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          behavior: SnackBarBehavior.floating,
        ),

        // ── Chips ─────────────────────────────────────────────────────────
        chipTheme: ChipThemeData(
          backgroundColor: surface,
          labelStyle:
              const TextStyle(color: Colors.white70, fontSize: 11),
          side: const BorderSide(color: border),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999)),
          padding: const EdgeInsets.symmetric(horizontal: 4),
        ),

        // ── Buttons ───────────────────────────────────────────────────────
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: accent,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: accent,
            side: const BorderSide(color: accent),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w500),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: accent,
            textStyle: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ),

        // ── Input ─────────────────────────────────────────────────────────
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surface,
          hintStyle: const TextStyle(color: Colors.white38),
          border: OutlineInputBorder(
            borderSide: const BorderSide(color: border),
            borderRadius: BorderRadius.circular(12),
          ),
          enabledBorder: OutlineInputBorder(
            borderSide: const BorderSide(color: border),
            borderRadius: BorderRadius.circular(12),
          ),
          focusedBorder: OutlineInputBorder(
            borderSide: const BorderSide(color: accent),
            borderRadius: BorderRadius.circular(12),
          ),
        ),

        // ── Typography ────────────────────────────────────────────────────
        textTheme: Typography.whiteCupertino,
      ),
      home: const SplashScreen(),
    );
  }
}
