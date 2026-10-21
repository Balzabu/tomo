# Changelog

User-facing changes per release. The section for a version is also the text of its GitHub Release (see [RELEASING.md](./RELEASING.md)).

## 1.5.5 (2026-10-20)

### What's new

- **Nero**, a pure-black theme for OLED screens: the blue and violet of Notte on a black that switches the pixels off. Seventeen themes now, plus Material You.

### Fixes

**Reading sessions**
- A session added or edited for a past day now finishes the book on that day: the finish date, the yearly goal and the statistics credit the day you read, not the day you logged it. Editing the day of the session that finished a book moves its finish date with it.
- Deleting or editing the session that had set a book's current page moves the page back to where the remaining sessions reached, and a book finished only by that session goes back to Reading, with its finish and read count undone.
- Editing a session logged from "Update progress" no longer gives it a one-minute duration, which skewed pages per hour, the time-left estimate and the fastest-book insight. It keeps "no time recorded".
- Tapping **Finish** on the session notification after Android had closed Tomo now asks how much of the time since the last activity to count, like the recovery prompt does, instead of silently stopping at the last activity. **Add quote**, and reopening the timer, ask the same question before the clock goes on.
- Tapping the session notification itself brings you back to the running timer, where the quote and note buttons are, instead of opening the finish form: only the notification's **Finish** button ends the session.
- Opening the timer for a book whose session was left from an earlier day no longer saves that session silently with no pages: you settle it first, with the same two estimates, and the new session starts right after. A short break past midnight no longer counts as a new day.
- A book finished between midnight and your end-of-day hour on 1 January counts for the year you were reading in, everywhere: the statistics tile, the insights, the year in books and the goals now agree.
- Statistics → **When you read**: sessions added by hand no longer count as morning or afternoon reading, including those logged late in the evening.
- The to-read pile forecast updates when the end-of-day hour changes.

**Backups and imports**
- Merging a backup no longer brings back reading sessions, notes, shelves or goals that were deleted here after they had been merged in from another device, and deleting them on the other device now removes them here too. Until now only books were protected this way.
- Automatic backups are checked after they are written: a file left empty or cut short when Android stopped the app mid-write is removed instead of being kept as one of your backups, and such leftovers from earlier versions no longer push a good backup out of the number you keep.
- A book exported to CSV with a series but no series number no longer comes back with the series name glued to its title (and as a duplicate) when the file is imported again: the export has two extra columns, Series and Series Number, which Tomo reads back. Importing a Goodreads export now also reads a series written without a number, such as "The Hobbit (Middle-earth Universe)".
- Goodreads, StoryGraph and Openreads CSV files saved by Excel in Italian or another European locale (semicolon-separated) are recognised instead of being reported as an unknown file; tab-separated files too.
- A book added by ISBN whose cover Open Library doesn't have no longer keeps a dead cover link, so **Fill in missing details** can find a real one.
- Page counts from library catalogues are no longer taken from a multi-volume or CD/DVD description ("2 v. (345, 410 p.)" gave 410).
- Sharing a file larger than the import limit to Tomo shows the "file too large" message instead of nothing, and the limit for shared files is the same as for picked ones (128 MB, up from 32 MB).
- A file shared to Tomo while another import is still running is imported as soon as that one finishes, instead of waiting for the app to be reopened.

**Library and screens**
- Deleting several books at once asks for confirmation, like every other delete, and the Undo bar stays up for seven seconds instead of four.
- Reading dates on the Edit book screen are picked on a calendar instead of typed as YYYY-MM-DD.
- Nothing hides under the Android navigation bar any more: with three-button navigation on Android 15 and later, the last row of every screen (settings pages, book details, notes, search, the year in books, the widget set-up) clears the bar, and the Save button of the session form stays reachable with the keyboard open.
- Small grey text (progress and status lines in the library, page numbers on notes, hints under goals, chart legends, placeholders) is more readable in every theme: it was too faint against the cards in most of them.
- Settings no longer says "Material You" on phones that can't use it (for example after restoring a backup from an Android 12+ phone on an older one); it shows "Automatic", which is what the app was already using.
- Sharing a book or a reading memory as text shows half stars (★★★★½) instead of rounding up, and the share cards' caption is upper-cased in the app language (a phone set to Turkish no longer produces a dotted "İ" in English).
- The error dialogs for a failed export or cover pick show a plain sentence instead of a raw error.

**Notifications and widgets**
- Starting a reading session no longer creates a "Reminders" notification channel if you never turned reminders on, and changing the reminders no longer cancels other scheduled notifications.
- Settings → Reminders says that the reminder may arrive a few minutes late while the phone is asleep (Android delivers it as an inexact alarm).
- The widgets' cache of book covers is cleaned up at launch and emptied by "Clear all data"; before, it kept growing and survived the wipe.

### Accessibility

- The timer's play/pause button announces the action ("Pause"/"Resume") instead of the current state, and the page fields are labelled.
- Ratings are read as a single "4 stars" and can be adjusted with the screen reader in half-star steps.
- Theme cards, shelf colours and symbols, share style and format buttons, the dialog close button, library selection rows and the selection toolbar expose their role and selected state; the note editor's page steppers and the session delete icon have proper labels and larger touch areas.
- The Undo bar is announced by TalkBack.

Install the APK below (Android 7.0+). It installs over v1.5.4.

## 1.5.4 (2026-10-11)

### Tablets and foldables

- Tomo rotates on tablets and unfolded foldables, and stays on the screen you're on when you turn the device. Phones stay in portrait as before.
- Statistics → **Reading calendar** fills a wide screen with more weeks, up to a whole year, instead of stretching 17 weeks into oversized squares.

### Fixes

- Exporting a backup or your library no longer offers Tomo itself in the share menu. Picking it left the export spinning, and no other export or image could be shared until Tomo was restarted.

### Under the hood

- A smaller, optimised app: the code is shrunk and optimised at build time.

Install the APK below (Android 7.0+). It installs over v1.5.3.

## 1.5.3 (2026-10-09)

### Fixes

- The reading reminder arrives once. On some phones (seen on a OnePlus 13) the system delivers it a moment early, and a second copy followed a few minutes later.
- Reminders no longer pile up in the notification shade: a new one replaces the one you haven't dismissed, and an old one is taken down once you've read that day or a new day has started.
- Statistics → **To-read pile**: your pace now counts only the time you've actually been tracking, up to the last 12 months. Before, a month of history was spread over a whole year, so someone who reads three books a month was told they read 0.3 and would clear a one-book pile months from now. While you have less than three months of history, the forecast says it's an early estimate.
- The tsundoku index uses the unit that fits: a pile you'll finish in ten days shows "10 days of tsundoku" instead of "0.0 years", then months, and years from a year up.

### Settings

- Reorganised: **General** (theme, language), **Reading** (reminders, end of day), **Library** (shelves, book search, fill in missing details), **Privacy & security** (app lock, privacy policy) and **Data** (backup & import, clear all data).
- **Backup & import**: both exports, the full backup (.json) and the library (.csv), are now together under **Export**, with one note explaining the difference. **Import** has a single **Import file** button, which recognises a Tomo backup as well as Bookmory, Openreads, Goodreads and StoryGraph files (there were two buttons doing the same thing).

Install the APK below (Android 7.0+). It installs over v1.5.2.

## 1.5.2 (2026-10-05)

### Fixes

- A reading timer left running overnight now asks how much of that time was reading when you come back the next day, instead of silently counting the whole night. The question never appeared before: the timer kept refreshing its "last activity" in the background and right on return.

Install the APK below (Android 7.0+). It installs over v1.5.1.

## 1.5.1 (2026-10-05)

### What's new

- Settings → Reading → **End of day**: choose when your reading day ends, from midnight (the default) to 6 AM. Reading between midnight and that time counts for the day before, so if you read past midnight your streak, goals and calendar still credit the evening you were reading. Statistics, goals, the calendar and the widgets update straight away, for past sessions too.

### Fixes

- A reading session that crosses midnight now counts for the day it started on: reading from 23:30 to 00:30 on Sunday no longer leaves Sunday empty and puts everything on Monday.
- The session history of a book shows the same day as the statistics (it showed the start day while the statistics used the end day).
- Sessions added or edited by hand stay on the day you pick, even when they are long or logged late in the evening.

Install the APK below (Android 7.0+). It installs over v1.5.0.

## 1.5.0 (2026-10-03)

### What's new

- Six new languages: Portuguese (Brazil), Dutch, Polish, Japanese, Korean and Traditional Chinese. Brazilian phones now get Brazilian Portuguese instead of the European one, and Taiwan, Hong Kong and Macau get Traditional Chinese.
- The widgets in the launcher's widget picker now have their names and descriptions in your language.

### Fixes

- Every translation was reviewed by native speakers, screen by screen: wording that was too literal or unnatural has been rewritten, terms are consistent across the app, and buttons say what they do (the ▶ button on the "Reading" cards no longer reads "Read" as in "finished" in some languages).
- Counts read correctly in the singular ("1 attempt left", "1 selected", "1 star") and, in Polish, in all plural forms.
- Dates, times, durations and percentages follow each language's conventions (e.g. "2. Okt." in German, "febrero de 2027" in Spanish, "2026年10月2日" in Japanese, "29 %" in French).
- Korean text wraps between words instead of in the middle of a word.
- Long labels no longer get cut off in segmented controls, the goal presets and the settings rows.
- The year in review shows the average rating with your language's decimal separator and the busiest month in full.
- Deleting a quote now says "Quote deleted" instead of "Note deleted".
- Widgets: the privacy text ("Tomo is locked · tap to open") no longer breaks mid-phrase in small widgets, and an empty reading time shows "–" instead of "0s".
- The camera permission screen of the barcode scanner centres its buttons.

Install the APK below (Android 7.0+). It installs over v1.4.0.

## 1.4.0 (2026-09-30)

### What's new

**Goals and statistics**
- Goals per day, month or year, in books, pages or minutes, plus challenges with their own start and end date. Each goal shows whether you're ahead of or behind schedule and what's left per day.
- New statistics: this year against last year to the same day, when you read (time of day and weekday), rating distribution, most-read authors, moods and pace.
- The to-read pile: how many books and pages are waiting, when you'd clear it at your pace, and its "tsundoku index". Shareable as a card.

**Reading**
- Reading plan: pick a deadline for a book and Tomo gives you each day's page quota and tells you whether you're on track.
- Reading curve on every book: pages reached over time, with the plan drawn alongside.
- Reading memory: when you finish a book, a card with dates, days, pages, time, rating, the reading curve and a favourite quote, ready to share.
- Notes and quotes in one place: a screen with every note and quote in the library, searchable and grouped by book.
- Capture a quote or a note during a reading session, from the timer or straight from the session notification, without stopping the clock.

**Home screen**
- New "Quote of the day" widget: one of your saved quotes each day, with its book and cover; tap ⇄ for another.
- The Reading widget shows today's reading-plan quota and can switch between the books you're reading.

**Reminders**
- Smarter reminders: they can skip the days you've already read, name the book you're in, and remind you when your streak is at stake.

**Backups and imports**
- Automatic backups into a folder you pick, daily or weekly, keeping as many as you choose.
- Restoring a backup can merge it with what's on the phone, keeping the most recent copy of everything, instead of replacing it. Before a merge removes books that were deleted on the other device, Tomo lists them and asks.
- Import from Bookmory (database or Excel export, with reads, timed sessions and notes) and Openreads (backup or CSV), besides Goodreads and StoryGraph.
- Share an export file to Tomo straight from another app.

**Privacy and security**
- App lock with a PIN and, optionally, fingerprint or face unlock.
- While the lock is on, Tomo can be blanked in the recent-apps screen, and widgets and notifications can hide titles, quotes and progress ("Hide content in widgets and notifications").
- Links from widgets, notifications and other apps wait for the PIN: nothing starts (not even a reading session) until the app is unlocked.
- Wrong PINs are throttled with growing pauses, and changing the phone's clock doesn't get around them.

**Looks**
- Material You: a theme with colours from your wallpaper (Android 12 and later).
- Redesigned share images for books, quotes, reading memories, the to-read pile and the year in books: four styles (minimal, gradient, cover and paper), square and story formats, and the year in books shows the covers of the year's books.
- Redesigned dialogs, date and time pickers, note editor and settings screens.

### Fixes

- A reading session no longer lands on the wrong day when it is paused across midnight, and a timer left running overnight asks how much of that time to count.
- Tapping "Add quote" or "Finish" on the session notification a second time now works.
- A reading session could start by itself when Android reopened Tomo from the recent-apps screen after closing it in the background.
- Deleting one of two copies of a book no longer removes the other copy on the next merge, and different editions of a book stay separate.
- Two sessions added by hand on the same day are no longer merged into one when restoring a backup.
- Re-reading a book imported without a read date now counts the new read.
- Editing a book no longer overwrites details filled in meanwhile by the automatic catalogue lookup.
- Book descriptions from the catalogues no longer show HTML codes such as `&#39;`.
- Dialogs dim the screen in the theme's own colours instead of turning it greenish.
- Faster: saving writes only what changed instead of the whole library, widgets refresh faster, and large libraries scroll and search more smoothly.

Install the APK below (Android 7.0+). It installs over v1.3.4.

## 1.3.4 (2026-09-24)

### New

- Settings has a **Privacy policy** row (in the Data group) that opens Tomo's privacy policy: https://balzabu.github.io/tomo/privacy.html. It explains what the app does with your data: everything stays on your device, and the only network requests fetch public book information.

Install the APK below (Android 7.0+). It installs over v1.3.3.

## 1.3.3 (2026-09-24)

### Fixes

- Confirmation and error dialogs now follow the app's theme. They used to follow the phone's light/dark mode and Android's own colours, so a dark theme could show a white dialog (and a light theme a grey one) with teal buttons. Destructive actions such as Delete are shown in the theme's red.
- The text cursor, the selection highlight and its handles use the theme's colour instead of Android's teal (or your wallpaper colour with Material You).
- The dots on the filter and sort buttons match the colour of the icons in every theme.
- The "Undo" button in the bottom bar (after deleting a book or a note) is readable in every theme; it was hard to see in most of them.
- Removed "Made by Balzabu" from the bottom of Settings: the GitHub and balzabu.io links are still there.

Install the APK below (Android 7.0+). It installs over v1.3.2.

## 1.3.2 (2026-09-24)

### Fixes

- On a network that hangs instead of failing (Wi-Fi without internet, a hotel login page, poor signal), "No connection" now shows after about 12 seconds instead of 20–30, for both title and ISBN searches. If Google is slow but Open Library answers, results appear after a few seconds instead of more than ten. In airplane mode the message still appears right away.
- Searches and the barcode scanner now say "Taking longer than usual…" after 5 seconds, so a slow network doesn't look like a frozen app.
- The search screen has a "Try again" button when there's no connection, like the scanner; you no longer need to edit the text to search again.
- A book found by ISBN is saved with the ISBN you scanned or typed. Open Library could return another edition's ISBN (e.g. a US edition for a Spanish one), which confused duplicate detection and catalogue updates.
- Library sorting can be reset: "Sort by" shows a Reset action when the order isn't the default one (Recently added, newest first), and the sort button gets a dot while a different order is active, like the filter button.

Install the APK below (Android 7.0+). It installs over v1.3.1.

## 1.3.1 (2026-09-24)

### Fixes

- "Update from catalogues" no longer offers the book's language: the app doesn't show or use it anywhere, and it appeared only as a code such as "es". The language is also left out of "Fill in missing details".

Install the APK below (Android 7.0+). It installs over v1.3.0.

## 1.3.0 (2026-09-24)

### What's new

- Update a book from the catalogues: in Edit book, "Update from catalogues" looks up the ISBN and shows what the catalogues have, field by field. Details the book is missing (cover, pages, author, publisher…) are already selected; anything that would replace what you entered is up to you. Nothing is saved until you tap Save.
- A book with an ISBN but no cover, page count or author shows a notice on its page that opens the update straight away.
- Fill in missing details for the whole library (Settings → Backup & import): looks up every book with an ISBN and fills only the empty fields, never what you entered. It shows its progress, can be cancelled, and if the connection drops it keeps what it found and picks up the rest next time.
- Manual entry and Edit book have an optional ISBN field. An ISBN that fails its checksum gets a warning but can still be saved.
- Adding a book by hand that's already in your library (same ISBN in any format, or same title and author) asks before creating a second copy.
- Books imported from Goodreads or StoryGraph now get their covers too, not only page counts.

### Fixes

- Books added by ISBN (scan or search) often came without a page count, Italian editions above all, but also German, Spanish, English and Japanese ones: the first catalogue that knew the book was used even when it had no page count. The page count is now looked up in the other catalogues too, including OPAC SBN, the Italian national library catalogue. Page counts specific to your edition take priority.
- A slow or unreachable catalogue no longer holds up a book that was already found.
- A book added from a title search without a page count gets it filled in shortly after.

Install the APK below (Android 7.0+). It installs over v1.2.2.

## 1.2.2 (2026-09-23)

### What's new

- Widgets appear right away when you add them: an empty card in the widget's shape and colour is shown until the content is ready, instead of an empty space.
- The widget picker now shows previews of the real widgets, in light and dark mode.
- Book covers in the widgets are saved on the device, so widgets refresh faster and use less data.

### Fixes

- On some launchers (e.g. OnePlus) the content of a newly added widget jumped around for a moment, as if it were resizing. It now appears once, already at the right size.
- The book picker for the Reading widget lays the widget out for its final size.

Install the APK below (Android 7.0+). It installs over v1.2.1.

## 1.2.1 (2026-09-22)

### What's new

- Redesigned home-screen widgets: bigger covers, clearer layout, the same icons as the app, and colours that match your theme.
- All widgets are resizable and adapt their layout to the size you give them (from 1x1 for the streak up to large sizes), instead of shrinking a fixed design.
- Reading: a play button starts a reading session for the book shown, straight from the home screen.
- Start session: the books you read most recently come first; when they don't all fit, a "+N" button opens your library.
- Reading calendar: fills the whole widget, hides days that haven't happened yet, outlines today and shows a legend and the number of reading days.
- Streak & goal: clear states for no goal, goal in progress and goal reached.

### Fixes

- Reading calendar cells were drawn in the wrong colours (orange/green instead of the theme colour).
- Widgets could stay blank after an app update or when Android had closed the app in the background.
- With the "Automatic" theme, widgets now switch between light and dark together with the system, even when the app is closed.
- The book picker for the Reading widget now follows the app theme (readable status bar, no dark flash in light mode).

Install the APK below (Android 7.0+). It installs over v1.2.0.

## 1.2.0 (2026-09-22)

### What's new

- Read history: starting a reread no longer erases the previous finish, so books you read again stay in last year's statistics, goals and year in review. Reading dates (started, finished, earlier reads) can now be edited from the book's edit screen, so books added as finished or imported from a CSV can be dated correctly.
- Update progress by hand can be logged as a reading session, so pages read without the timer count toward goals, the heatmap and the year in review.
- Export your library as a Goodreads-style CSV (re-importable into Tomo, Goodreads or StoryGraph).
- Year in review for any past year with enough activity, not just the current one.
- Notes and quotes can be edited by tapping them; deleting a note can be undone.
- Library sort, direction and filter are remembered between launches; new sorts by date finished and date started.
- ISBNs are validated and normalised to ISBN-13 everywhere, so a book imported from Goodreads with an ISBN-10 is recognised when scanned. The scanner ignores non-book barcodes instead of looking them up.
- CSV import reads the Goodreads/StoryGraph read count and StoryGraph reading date ranges; a few parser edge cases are fixed.

### Fixes

- Storage: the library is now saved in per-collection chunks instead of one large record. A very large library could previously be written but never read back on Android, leaving the app empty with saves blocked. Existing data migrates automatically on first launch.
- Custom covers could be deleted at launch if the library failed to load - fixed.
- Session recovery after the app was killed now offers both the safe estimate and "until now", and can no longer discard the session by tapping outside the dialog.
- Page numbers past the book's length or before the start page are rejected in the timer and session editors; the progress dialog no longer resets to page 0 on an empty field.
- Lowering the page of a finished book moves it back to reading; a rating can be cleared again.
- Post-import page-count lookups no longer overwrite edits made in the meantime, and searches are cancelled when superseded.
- Durations and large numbers follow the app language; more accessibility labels.

Install the APK below (Android 7.0+). It installs over v1.1.3.

## 1.1.3 (2026-09-19)

### What's new

- Search for books by typing an ISBN, with exact ISBN lookup and ISBN shown in results.
- Fixed finished books added from search or manually so they count correctly in yearly statistics and goals.
- Fixed reread counting and progress consistency after changing a book's page count.
- Disabled Android cloud backup and removed the obsolete storage permission.
- Updated compatible Expo patch releases and improved the release build script.

### Important installation note

This release uses a new signing key. It cannot be installed as an update over APKs from previous releases. Export your Tomo backup from the old version, uninstall it, install v1.1.3, then import your backup.

## 1.1.2 (2026-07-03)

Bug-fix release: session attribution, backup safety, duplicates and offline UX. All changes were found by a deep multi-agent audit of the codebase and verified on-device.

- Timer: opening a widget quick-start while another book's timer was on screen could silently record that book's time against the new one - fixed; cold-start recovery races closed; the ongoing notification can no longer be orphaned; DST-safe session recovery/editing; sessions crossing midnight now count toward the new day's goals and streak
- Data safety: a corrupt or unreadable library is quarantined instead of being overwritten; a failed backup import rolls back instead of showing unsaved data; delete-undo can no longer lose cover files when a storage error pops up mid-window; clear-all can't be resurrected by a pending write
- Backup: hand-edited backups can no longer break exports permanently; backups received via messaging apps (octet-stream) are selectable again; the exported file is no longer deleted while Drive/Gmail may still be uploading it
- Search & scan: adding a book you already own warns with "add anyway" instead of duplicating; being offline says "no connection" with a retry instead of "no results" / "book not found"; hardware back closes the status sheet instead of the whole search; double-tap on Save can't create duplicate books
- Covers: missing Open Library covers fall back to the title placeholder instead of a permanently blank image; picked covers are resized (~600px), shrinking backups and widget memory use
- Stats: streak/heatmap/weekly chart refresh when a new day starts; last year's Wrapped stays available in January; pages/hour no longer deflated by timed sessions without page numbers
- Widgets: covers are passed as file URIs instead of multi-MB base64 on every refresh; widgets follow OS dark-mode changes immediately; concurrent widget events can't corrupt the pinned-book selection

Install the APK below (Android).

## 1.1.1 (2026-07-02)

Bug-fix release: data integrity, sessions and import.

- Re-tapping a finished book's status no longer rewrites its finish date (stats, wrapped and goals stay correct)
- Timer: backing out immediately discards the session; starting a timer while another book's session is active banks it instead of dropping it; stale widget/notification links to deleted books no longer start ghost sessions
- Failed storage writes now surface an error and retry instead of silently losing data
- Backup import: invalid session dates are derived from start time, duplicate ids are dropped
- CSV import matches existing books by ISBN and by title|author, avoiding duplicates
- Search: cleared queries no longer resurface stale results; double-tapping a status no longer adds the book twice
- Session deletion asks for confirmation; DST-safe day stepping in the session editor
- Widgets refresh on theme/language change; localized notification channels; various smaller fixes

Install the APK below (Android).

## 1.1.0 (2026-07-01)

Performance, correctness and robustness improvements.

- Debounced saves; widgets refresh from memory instead of re-reading the database
- Re-reading a finished book starts a new read and is recorded
- Import/backup: size limits, temp-file cleanup, safer parsing, local-time dates
- Faster library: memoised rows, precomputed search, list tuning
- Crash-safe UI; scan/search cancel on close; reminder permission re-check
- Reading heatmap scaled to the visible range
- Storage keys migrated automatically; existing data is preserved

Install the APK below (Android). Verified on emulator.

## 1.0.1 (2026-06-29)

Reading sessions now survive the screen turning off and the app being closed in the background.

### What's new
- A running reading session is saved to your device and rebuilt from timestamps when you reopen Tomo, so it's no longer lost if Android closes the app in the background (Doze, low memory, OEM task-killers).
- While a session is running, an ongoing notification lets you finish it straight from the notification shade, with the screen off.
- If a session was interrupted, Tomo offers to save it the next time you open the app, so you can confirm the time and pages.
- Strings updated for all 6 languages.

### Install
1. Download `tomo-v1.0.1.apk` below.
2. On your phone, allow installing unknown apps in your browser or files app.
3. Open the APK to install. It updates v1.0.0 and keeps your data.

## 1.0.0 (2026-06-26)

A free, local-first reading tracker for Android. Keep a library, time your reading sessions, track progress and goals, and look at your stats, with everything stored on your device.

### Highlights
- Library organised by status, with custom coloured shelves.
- Add books by online search (Google Books / Open Library), ISBN barcode scan, or by hand.
- A reading timer with per-book progress and a remaining-time estimate.
- Stats: day streak, weekly chart, GitHub-style heatmap, and monthly insights.
- Goals for books/year, minutes/day and pages/day, plus a shareable "year in books".
- Notes, quotes, half-star ratings and reviews.
- CSV import from Goodreads and StoryGraph; full JSON backup and restore.
- Home-screen widgets, 16 light and dark themes, 6 languages.
- No account, no ads, no analytics. Nothing leaves your device.

### Install
1. Download `tomo-v1.0.0.apk` below.
2. On your phone, allow installing unknown apps in your browser or files app.
3. Open the APK to install. Requires Android 7.0 (API 24) or newer.

Built with Expo and React Native. Source released under the GPLv3.
