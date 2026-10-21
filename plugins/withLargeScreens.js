// Expo config plugin: large screens (tablets, foldables).
//
// Android 16 ignores orientation and resizability restrictions on large
// screens, and Play flags any android:screenOrientation in the manifest.
// - No orientation in the manifest (app.json "orientation": "default"): phones
//   are kept in portrait at runtime instead, by MainActivity, when the
//   display's smallest width is under 600dp. Tablets and unfolded foldables
//   rotate freely.
// - The ML Kit code scanner activity (pulled in by expo-camera) declares
//   portrait too: the attribute is removed from the merged manifest.
// - smallestScreenSize/screenLayout changes (fold/unfold, window resizing) are
//   handled in place: recreating MainActivity would drop the navigation state.
const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const SCANNER = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';
const CONFIG_CHANGES = ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize'];

const IMPORTS = `import android.content.pm.ActivityInfo
import android.content.res.Configuration
`;

const POLICY = `
  // tomo: portrait on phones only; tablets and unfolded foldables rotate freely.
  private fun applyOrientationPolicy() {
    val smallestDp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = windowManager.maximumWindowMetrics.bounds
      minOf(bounds.width(), bounds.height()) / resources.displayMetrics.density
    } else {
      resources.configuration.smallestScreenWidthDp.toFloat()
    }
    requestedOrientation = if (smallestDp < 600f) ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyOrientationPolicy()
  }
`;

module.exports = function withLargeScreens(config) {
  config = withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('tomo: portrait on phones only')) {
      if (!src.includes('import android.os.Bundle')) throw new Error('withLargeScreens: MainActivity imports not found');
      src = src.replace('import android.os.Bundle\n', 'import android.os.Bundle\n' + IMPORTS);
      const call = 'super.onCreate(null)';
      if (!src.includes(call)) throw new Error('withLargeScreens: MainActivity.onCreate not found');
      src = src.replace(call, call + '\n    applyOrientationPolicy()');
      const anchor = '\n  /**\n   * Returns the name of the main component';
      if (!src.includes(anchor)) throw new Error('withLargeScreens: MainActivity.getMainComponentName not found');
      src = src.replace(anchor, POLICY + anchor);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    const main = (app.activity ?? []).find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      delete main.$['android:screenOrientation'];
      const changes = new Set((main.$['android:configChanges'] ?? '').split('|').filter(Boolean));
      CONFIG_CHANGES.forEach((c) => changes.add(c));
      main.$['android:configChanges'] = [...changes].join('|');
    }
    app.activity = (app.activity ?? []).filter((a) => a.$['android:name'] !== SCANNER);
    app.activity.push({ $: { 'android:name': SCANNER, 'tools:remove': 'android:screenOrientation' } });
    return cfg;
  });
};
