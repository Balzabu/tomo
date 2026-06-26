// Expo config plugin: keep `lintVitalRelease` from failing the Android release
// build over the iOS-only permission keys (NSCameraUsageDescription,
// NSPhotoLibraryUsageDescription) that the `locales` config emits into
// per-locale string resources without a default-locale entry (ExtraTranslation).
// Harmless on Android, so we disable just that one lint check.
const { withAppBuildGradle } = require('@expo/config-plugins');

const LINT_BLOCK = `
    lint {
        disable 'ExtraTranslation'
    }
`;

module.exports = function withAndroidLintFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes("disable 'ExtraTranslation'")) {
      // Insert right after the top-level `android {` opening brace.
      src = src.replace(/android\s*\{/, (m) => `${m}${LINT_BLOCK}`);
      cfg.modResults.contents = src;
    }
    return cfg;
  });
};
