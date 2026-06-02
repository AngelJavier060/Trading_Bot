import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Paleta exacta de los mockups Tailwind (Bot Javiercito Trading)
/// Material Design 3 — Light Institutional
class AppColors {
  // Surfaces
  static const Color background = Color(0xFFF8F9FF);
  static const Color surface = Color(0xFFF8F9FF);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceContainerLow = Color(0xFFEFF4FF);
  static const Color surfaceContainer = Color(0xFFE5EEFF);
  static const Color surfaceContainerHigh = Color(0xFFDCE9FF);
  static const Color surfaceContainerHighest = Color(0xFFD3E4FE);
  static const Color surfaceVariant = Color(0xFFD3E4FE);
  static const Color surfaceDim = Color(0xFFCBDBF5);
  static const Color surfaceBright = Color(0xFFF8F9FF);

  // Brand
  static const Color primary = Color(0xFF000000); // Dark text-as-primary (mockup uses black)
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFF131B2E);
  static const Color onPrimaryContainer = Color(0xFF7C839B);
  static const Color primaryFixed = Color(0xFFDAE2FD);
  static const Color primaryFixedDim = Color(0xFFBEC6E0);

  // Secondary (azul institucional para botones de acción)
  static const Color secondary = Color(0xFF0058BE);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color secondaryContainer = Color(0xFF2170E4);
  static const Color secondaryFixed = Color(0xFFD8E2FF);
  static const Color secondaryFixedDim = Color(0xFFADC6FF);

  // Tertiary (verde — activos / conectado / win)
  static const Color tertiary = Color(0xFF006C49);
  static const Color tertiaryFixed = Color(0xFF6FFBBE);
  static const Color tertiaryFixedDim = Color(0xFF4EDEA3);
  static const Color onTertiaryFixed = Color(0xFF002113);
  static const Color onTertiaryFixedVariant = Color(0xFF005236);

  // Error / Loss
  static const Color error = Color(0xFFBA1A1A);
  static const Color errorContainer = Color(0xFFFFDAD6);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color onErrorContainer = Color(0xFF93000A);

  // Text
  static const Color onSurface = Color(0xFF0B1C30);
  static const Color onSurfaceVariant = Color(0xFF45464D);
  static const Color outline = Color(0xFF76777D);
  static const Color outlineVariant = Color(0xFFC6C6CD);

  // Semantic shortcuts (compatibles con código existente)
  static const Color bg = background;
  static const Color card = surfaceContainerLowest;
  static const Color cardAlt = surfaceContainerLow;
  static const Color textPrimary = onSurface;
  static const Color textSecondary = onSurfaceVariant;
  static const Color textMuted = outline;
  static const Color border = outlineVariant;
  static const Color borderLight = Color(0xFFE0E2EA);
  static const Color win = tertiary;
  static const Color loss = error;
  static const Color pending = Color(0xFFF59E0B);
  static const Color primaryLight = secondaryContainer;

  // Gradientes
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [secondary, Color(0xFF003F8F)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const LinearGradient winGradient = LinearGradient(
    colors: [tertiary, Color(0xFF004D34)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const LinearGradient lossGradient = LinearGradient(
    colors: [error, Color(0xFF8C0E0E)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // Sombra suave para tarjetas
  static List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: const Color(0xFF0F172A).withOpacity(0.04),
          blurRadius: 20,
          offset: const Offset(0, 4),
        ),
      ];
}

class AppTheme {
  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: const ColorScheme.light(
        background: AppColors.background,
        onBackground: AppColors.onSurface,
        surface: AppColors.surface,
        onSurface: AppColors.onSurface,
        surfaceVariant: AppColors.surfaceContainerLow,
        onSurfaceVariant: AppColors.onSurfaceVariant,
        primary: AppColors.secondary,
        onPrimary: AppColors.onSecondary,
        secondary: AppColors.tertiary,
        onSecondary: AppColors.onPrimary,
        error: AppColors.error,
        onError: AppColors.onError,
        outline: AppColors.outline,
        outlineVariant: AppColors.outlineVariant,
      ),
      textTheme: GoogleFonts.interTextTheme(
        const TextTheme(
          displayLarge: TextStyle(color: AppColors.onSurface),
          displayMedium: TextStyle(color: AppColors.onSurface),
          displaySmall: TextStyle(color: AppColors.onSurface),
          headlineLarge: TextStyle(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4),
          headlineMedium: TextStyle(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.2),
          headlineSmall: TextStyle(
              color: AppColors.onSurface, fontWeight: FontWeight.w600),
          titleLarge: TextStyle(
              color: AppColors.onSurface, fontWeight: FontWeight.w700),
          titleMedium: TextStyle(
              color: AppColors.onSurface, fontWeight: FontWeight.w600),
          titleSmall: TextStyle(color: AppColors.onSurface),
          bodyLarge: TextStyle(color: AppColors.onSurface),
          bodyMedium: TextStyle(color: AppColors.onSurfaceVariant),
          bodySmall: TextStyle(color: AppColors.outline),
          labelLarge: TextStyle(color: AppColors.onSurface),
          labelMedium: TextStyle(color: AppColors.onSurfaceVariant),
          labelSmall: TextStyle(color: AppColors.outline),
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surfaceContainerLowest,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.outlineVariant),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.onSurface,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
        iconTheme: IconThemeData(color: AppColors.onSurface),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surfaceContainerLowest,
        selectedItemColor: AppColors.secondary,
        unselectedItemColor: AppColors.outline,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.secondary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.onSurface,
          side: const BorderSide(color: AppColors.outline),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.secondary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceContainerLow,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.secondary, width: 1.5),
        ),
        labelStyle: const TextStyle(color: AppColors.onSurfaceVariant),
        hintStyle: const TextStyle(color: AppColors.outline),
        prefixIconColor: AppColors.outline,
        suffixIconColor: AppColors.outline,
      ),
      dividerColor: AppColors.outlineVariant,
      iconTheme: const IconThemeData(color: AppColors.onSurfaceVariant),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.secondary,
        linearTrackColor: AppColors.surfaceContainerHigh,
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: AppColors.secondary,
        inactiveTrackColor: AppColors.surfaceContainerHigh,
        thumbColor: AppColors.secondary,
        overlayColor: AppColors.secondary.withOpacity(0.1),
        trackHeight: 4,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? Colors.white
                : AppColors.outline),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? AppColors.tertiary
                : AppColors.surfaceContainerHigh),
        trackOutlineColor:
            WidgetStateProperty.all(Colors.transparent),
      ),
    );
  }

  /// Mantenido para compatibilidad con código previo
  static ThemeData get dark => light;
}
