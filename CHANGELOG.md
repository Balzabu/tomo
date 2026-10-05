# Changelog

User-facing changes per release. The section for a version is also the text of its GitHub Release (see [RELEASING.md](./RELEASING.md)). Releases up to 1.3.4 have their notes on the [Releases](https://github.com/Balzabu/tomo/releases) page only.

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
