// Expo config plugin: Android manifest hardening.
//
// - com.canhub.cropper.CropImageActivity (pulled in by expo-image-picker,
//   which only uses its own non-exported subclass) is declared exported by
//   its library: any app could start it and make Tomo write a JPEG over its
//   own private files. Force it non-exported.
// - <queries> for the HOME intent: the widget image provider (patched in
//   patches/react-native-android-widget+*.patch) serves images only to the
//   default launcher, which it has to be able to resolve on Android 11+.
// - Device-to-device transfer and cloud backup excluded entirely:
//   allowBackup=false alone doesn't cover device-to-device on SDK 31+.
// - A task recreated by the system (process death, relaunch from recents)
//   hands MainActivity the intent that first opened it: a widget's "start
//   reading" link or a share would fire again by itself. Such a launch is
//   turned into a plain app launch.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withMainActivity } = require('@expo/config-plugins');

const RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </device-transfer>
</data-extraction-rules>
`;

const REPLAY_GUARD = `    // tomo: a restored task replays its original intent - open plain instead.
    if (savedInstanceState != null ||
        (intent.flags and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
      intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
        .addCategory(android.content.Intent.CATEGORY_LAUNCHER)
        .setComponent(intent.component)
    }
`;

module.exports = function withPrivacyHardening(config) {
  config = withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('tomo: a restored task')) {
      const anchor = 'super.onCreate(null)';
      if (!src.includes(anchor)) throw new Error('withPrivacyHardening: MainActivity.onCreate not found');
      src = src.replace(anchor, REPLAY_GUARD.trimStart() + '    ' + anchor);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    app.$['android:dataExtractionRules'] = '@xml/tomo_data_extraction_rules';
    app.$['android:fullBackupContent'] = 'false';
    app.activity = (app.activity ?? []).filter((a) => a.$['android:name'] !== 'com.canhub.cropper.CropImageActivity');
    app.activity.push({
      $: {
        'android:name': 'com.canhub.cropper.CropImageActivity',
        'android:exported': 'false',
        'tools:replace': 'android:exported',
      },
    });
    manifest.queries = manifest.queries ?? [{}];
    const q = manifest.queries[0];
    q.intent = (q.intent ?? []).filter((i) => !(i.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.HOME'));
    q.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.HOME' } }],
    });
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'tomo_data_extraction_rules.xml'), RULES);
      return cfg;
    },
  ]);
};
