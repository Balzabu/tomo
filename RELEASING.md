# Releasing

Tomo ships as a signed APK attached to a GitHub Release. There is no app store.

1. Bump the version in `app.json` (`expo.version` and `expo.android.versionCode`)
   and in `android/app/build.gradle` (`versionName` and `versionCode`).
   `versionCode` has to increase on every release.

2. Build the signed APK:

   ```bash
   ./build-release.sh apk
   # output: android/app/build/outputs/apk/release/app-release.apk
   ```

   Signing reads `android/keystore.properties`, which is gitignored. Without it the build is unsigned.

3. Publish the release:

   ```bash
   cp android/app/build/outputs/apk/release/app-release.apk tomo-v1.0.0.apk
   gh release create v1.0.0 tomo-v1.0.0.apk --title "Tomo v1.0.0" --notes "..."
   ```

Back up `android/app/tomo-upload.keystore` and `android/keystore.properties` offline.
If you lose the signing key you cannot ship updates that install over an existing copy.
