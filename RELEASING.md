# Releasing

Tomo ships as a signed APK attached to a GitHub Release. There is no app store.

## 1. Prepare

1. Bump the version in `app.json` (`expo.version` and `expo.android.versionCode`),
   `package.json` (`version`), and `android/app/build.gradle` (`versionName` and `versionCode`).
   `versionCode` has to increase on every release.
2. In [CHANGELOG.md](./CHANGELOG.md), replace `(unreleased)` with the release date and
   check that the last line names the version it installs over.
3. If the README's features changed, update `README.md`, the privacy policy in
   `docs/privacy.html` (bump its effective date) and, when screens changed, the
   screenshots: see [scripts/screenshots/README.md](./scripts/screenshots/README.md).

## 2. Check

```bash
npx tsc --noEmit
npm run check
```

Both must pass.

If you changed `app.json`, a config plugin in `plugins/` or a native dependency, regenerate
the native project (never with `--clean`: `android/` is committed and has hand edits no
plugin recreates, such as `AsyncStorage_db_size_in_MB` in `android/gradle.properties`):

```bash
npx expo prebuild --platform android --no-install
rm android/app/src/main/res/mipmap-*/ic_launcher*.webp   # prebuild adds .webp copies of the
                                                         # committed PNG icons: duplicate resources
```

If you edited a file under `node_modules/` on purpose, update its patch, leaving build outputs out:

```bash
npx patch-package <package> --exclude '(^package\.json$|android/build/|\.gradle/)'
```

## 3. Build

```bash
./build-release.sh apk
# output: android/app/build/outputs/apk/release/app-release.apk
```

Signing reads `android/keystore.properties`, which is gitignored. Without it the build is unsigned.

## 4. Test on a device

Install the APK **over the previous release** (not on a clean install), so the data
migration is tested too, then at least:

- the library, a book page and the stats open with the old data intact;
- a reading session: start, pause, "Add quote" and "Finish" from the notification, save,
  force-stop the app and reopen: the session and the new page are there;
- the widgets refresh after the save;
- with the app lock on: widgets and notification links wait for the PIN, and the app locks
  again after leaving it;
- a backup export, and a merge restore of it.

## 5. Publish

Commit, tag and push first: `gh release create` tags whatever the default branch points at
on GitHub, so an unpushed release would be tagged on the previous version's code.

```bash
git add -A && git commit -m "Tomo vX.Y.Z"
git tag vX.Y.Z && git push origin main vX.Y.Z
cp android/app/build/outputs/apk/release/app-release.apk tomo-vX.Y.Z.apk
# the release notes are the version's section of CHANGELOG.md, without its heading
awk '/^## X.Y.Z/{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/notes.md
gh release create vX.Y.Z tomo-vX.Y.Z.apk --verify-tag --title "Tomo vX.Y.Z" --notes-file /tmp/notes.md
```

## Signing key

Back up `android/app/tomo-release.keystore` and `android/keystore.properties` offline.
If you lose the signing key you cannot ship updates that install over an existing copy.
