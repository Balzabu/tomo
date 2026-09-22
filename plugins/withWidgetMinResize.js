// Expo config plugin: add android:minResizeWidth / minResizeHeight to the
// home-screen widget provider XMLs written by react-native-android-widget,
// whose own config only knows minWidth/minHeight (the *default* size on
// pre-Android 12 launchers) and maxResize*. Without a smaller min-resize
// size a widget can't be shrunk below its default footprint.
//
// Dangerous mods run newest-first, so this plugin must be listed *before*
// "react-native-android-widget" in app.json to patch the files after they
// have been generated.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withWidgetMinResize(config, sizes = {}) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      for (const [name, { width, height }] of Object.entries(sizes)) {
        const file = path.join(dir, `widgetprovider_${name.toLowerCase()}.xml`);
        if (!fs.existsSync(file)) continue;
        let xml = fs.readFileSync(file, 'utf8');
        xml = xml.replace(/\s*android:minResize(Width|Height)="[^"]*"/g, '');
        xml = xml.replace(
          /(android:minHeight="[^"]*")/,
          `$1\n    android:minResizeWidth="${width}"\n    android:minResizeHeight="${height}"`
        );
        fs.writeFileSync(file, xml);
      }
      return cfg;
    },
  ]);
};
