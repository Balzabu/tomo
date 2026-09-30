# Screenshots

The images in `screenshots/` (README and Play Store) are real device captures
of a demo library, framed by `compose.py`. To redo them:

1. **Demo library.** `python3 scripts/screenshots/demo_library.py > /tmp/demo.json`
   builds a backup with ~30 well-known books (Open Library covers), a year of
   sessions, quotes, shelves and goals, dated relative to today. On a test
   device, make a backup of the real data first, then restore `/tmp/demo.json`
   with **Replace**.
2. **Device setup.** App language English, theme Night ("Notte"); for the home-screen
   shot, the system in dark mode. Clean status bar:

   ```bash
   adb shell settings put global sysui_demo_allowed 1
   adb shell am broadcast -a com.android.systemui.demo -e command enter
   adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
   adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
   adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
   ```

3. **Capture** each screen at full resolution into `raw/`
   (`adb exec-out screencap -p > scripts/screenshots/raw/01-library.png`), with the names
   `compose.py` reads: `01-library` (library), `02-book` (book page with a
   reading plan), `04b-stats-top` and `04-stats` (statistics, top and scrolled
   to the calendar), `05-goals` (scrolled to the yearly goal and the
   challenge), `06-quotes` (the quote share sheet), `06b-quotes-list`,
   `07-widgets` (home screen), `08-wrapped` (year in books, story) and
   `09-lock` (lock screen). Some frames use real UI cards cut out of these
   captures: the crop boxes in `compose.py` assume the demo library's layout.
4. **Compose:** `python3 scripts/screenshots/compose.py` (needs Pillow;
   downloads the Inter font once). It writes the eight 1080×1920 frames and
   `play-feature-graphic.png` (1024×500) into `screenshots/`, and the same
   picture at 2048×1000 as `banner.png` (the README banner). `… compose.py
   scripts/screenshots/raw screenshots feature` redoes only those two. Headlines and
   layouts are one function per frame in `compose.py`; the frames share one
   continuous background, so keep them in order on the store.
5. Restore the real backup and the device settings; exit demo mode with
   `adb shell am broadcast -a com.android.systemui.demo -e command exit`.

The set is built for Google Play's 8 phone screenshots, in order: the first
frames carry the main benefit, since few people swipe past the third.
