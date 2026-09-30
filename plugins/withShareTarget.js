// Expo config plugin: lets other apps share files to Tomo (Android "Share"
// sheet). Bookmory, for one, exports only through the share sheet - sharing
// its file to Tomo is the shortest way over. Only documents (application/*,
// CSV): Tomo has nothing to do with shared images, videos or links.
//
// ACTION_SEND only, not VIEW: a VIEW intent's content:// data would reach
// expo-router as a deep link and land on "unmatched route".
const { withAndroidManifest } = require('@expo/config-plugins');

// No text/*: plain-text shares (links) would list Tomo for nothing; CSVs
// come as text/csv (or application/*, which covers zip, json, xlsx, db).
const MIME_TYPES = ['application/*', 'text/csv', 'text/comma-separated-values'];

module.exports = function withShareTarget(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) return cfg;
    main['intent-filter'] = (main['intent-filter'] ?? []).filter(
      (f) => !(f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND')
    );
    main['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: MIME_TYPES.map((m) => ({ $: { 'android:mimeType': m } })),
    });
    return cfg;
  });
};
