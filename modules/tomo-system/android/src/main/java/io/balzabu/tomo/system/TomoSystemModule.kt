package io.balzabu.tomo.system

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.OpenableColumns
import android.provider.Settings
import java.util.concurrent.Executors
import android.view.WindowManager
import java.io.File
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Small platform hooks Tomo needs that no Expo package exposes:
//  - the Android 12+ dynamic ("Material You") colour palettes, for the
//    wallpaper-based theme;
//  - hiding the app's content in the recent-apps switcher, for the app lock;
//  - files shared to Tomo from other apps (Share sheet), copied into the
//    cache so the JS side can read them after the sender's grant expires.
class TomoSystemModule : Module() {
  private val tones = intArrayOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)

  override fun definition() = ModuleDefinition {
    Name("TomoSystem")

    Events("onSharedFile")

    // The file this launch was started with (a share), once - null otherwise.
    // Async: the copy can be large or streamed from the network.
    AsyncFunction("consumeSharedFile") {
      val activity = appContext.currentActivity ?: return@AsyncFunction null
      val intent = activity.intent
      if (intent?.action != Intent.ACTION_SEND) return@AsyncFunction null
      // Consumed: a recreated activity must not import it again.
      activity.intent = Intent(intent).apply {
        action = Intent.ACTION_MAIN
        removeExtra(Intent.EXTRA_STREAM)
      }
      copyShared(intent)
    }

    // A share while Tomo is already running: copy off the UI thread, one at
    // a time.
    OnNewIntent { intent ->
      if (intent.action == Intent.ACTION_SEND) {
        copier.execute { copyShared(intent)?.let { sendEvent("onSharedFile", it) } }
      }
    }

    // Monotonic time for the app lock: the wall clock can be changed by
    // whoever holds the phone (to skip a relock or a PIN lockout), this can't.
    Function("clock") {
      val boot = try {
        Settings.Global.getInt(appContext.reactContext?.contentResolver, Settings.Global.BOOT_COUNT)
      } catch (e: Exception) {
        -1
      }
      mapOf("elapsed" to SystemClock.elapsedRealtime().toDouble(), "boot" to boot)
    }

    // { accent1: { "0": "#ffffff", "10": …, … "1000": "#000000" }, accent2, accent3, neutral1, neutral2 }
    // or null below Android 12.
    Function("getDynamicPalettes") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function null
      val ctx = appContext.reactContext ?: return@Function null
      val palettes = mapOf(
        "accent1" to accent1,
        "accent2" to accent2,
        "accent3" to accent3,
        "neutral1" to neutral1,
        "neutral2" to neutral2,
      )
      palettes.mapValues { (_, ids) ->
        tones.indices.associate { i ->
          tones[i].toString() to String.format("#%06X", 0xFFFFFF and ContextCompat.getColor(ctx, ids[i]))
        }
      }
    }

    // Android 13+: blank snapshot in Recents, screenshots still allowed.
    // Older versions fall back to FLAG_SECURE (which also blocks screenshots).
    Function("setRecentsHidden") { hidden: Boolean ->
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          activity.setRecentsScreenshotEnabled(!hidden)
        } else if (hidden) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
      }
      true
    }
  }

  // Nothing Tomo imports comes close; larger files would only strain memory
  // once read into JS.
  private val maxSharedBytes = 32L * 1024 * 1024
  private val copier = Executors.newSingleThreadExecutor()

  private fun copyShared(intent: Intent?): Map<String, String>? {
    if (intent?.action != Intent.ACTION_SEND) return null
    val ctx = appContext.reactContext ?: return null
    return try {
      // IntentCompat: the typed getParcelableExtra is buggy on Android 13.
      val uri: Uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: return null
      // Confused deputy: we open the URI with Tomo's own permissions, so a
      // sender must not be able to point it at Tomo's private files - no
      // file:// at all, no content:// from our own providers.
      if (uri.scheme != "content") return null
      // Never our own providers (a confused deputy: the sender can't read them,
      // we can). Resolve the provider rather than match the authority text:
      // "0@<authority>" names the same provider for another user id.
      val authority = uri.authority ?: return null
      if (authority.contains('@') || uri.userInfo != null) return null
      // (Our own providers always resolve for us; another app's may not be
      // visible, which is fine - it isn't ours.)
      if (ctx.packageManager.resolveContentProvider(authority, 0)?.packageName == ctx.packageName) return null
      var name = "shared"
      ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst() && !c.isNull(0)) name = c.getString(0)
      }
      val dir = File(ctx.cacheDir, "shared-imports").apply { mkdirs() }
      // Earlier shares are done with after an hour; a new one gets its own
      // file so two quick shares can't overwrite each other.
      val cutoff = System.currentTimeMillis() - 3_600_000
      dir.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
      val safe = name.replace(Regex("[^A-Za-z0-9._() -]"), "_").take(80).trim('.', ' ')
      val out = File(dir, "${System.nanoTime()}-${safe.ifBlank { "shared" }}")
      ctx.contentResolver.openInputStream(uri)?.use { input ->
        out.outputStream().use { output ->
          val buf = ByteArray(64 * 1024)
          var total = 0L
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            total += n
            // Nothing Tomo imports is this big: stop instead of filling the cache.
            if (total > maxSharedBytes) {
              out.delete()
              return null
            }
            output.write(buf, 0, n)
          }
        }
      } ?: return null
      mapOf("uri" to Uri.fromFile(out).toString(), "name" to name)
    } catch (e: Exception) {
      null
    }
  }

  private val accent1 = intArrayOf(
    android.R.color.system_accent1_0, android.R.color.system_accent1_10, android.R.color.system_accent1_50,
    android.R.color.system_accent1_100, android.R.color.system_accent1_200, android.R.color.system_accent1_300,
    android.R.color.system_accent1_400, android.R.color.system_accent1_500, android.R.color.system_accent1_600,
    android.R.color.system_accent1_700, android.R.color.system_accent1_800, android.R.color.system_accent1_900,
    android.R.color.system_accent1_1000,
  )
  private val accent2 = intArrayOf(
    android.R.color.system_accent2_0, android.R.color.system_accent2_10, android.R.color.system_accent2_50,
    android.R.color.system_accent2_100, android.R.color.system_accent2_200, android.R.color.system_accent2_300,
    android.R.color.system_accent2_400, android.R.color.system_accent2_500, android.R.color.system_accent2_600,
    android.R.color.system_accent2_700, android.R.color.system_accent2_800, android.R.color.system_accent2_900,
    android.R.color.system_accent2_1000,
  )
  private val accent3 = intArrayOf(
    android.R.color.system_accent3_0, android.R.color.system_accent3_10, android.R.color.system_accent3_50,
    android.R.color.system_accent3_100, android.R.color.system_accent3_200, android.R.color.system_accent3_300,
    android.R.color.system_accent3_400, android.R.color.system_accent3_500, android.R.color.system_accent3_600,
    android.R.color.system_accent3_700, android.R.color.system_accent3_800, android.R.color.system_accent3_900,
    android.R.color.system_accent3_1000,
  )
  private val neutral1 = intArrayOf(
    android.R.color.system_neutral1_0, android.R.color.system_neutral1_10, android.R.color.system_neutral1_50,
    android.R.color.system_neutral1_100, android.R.color.system_neutral1_200, android.R.color.system_neutral1_300,
    android.R.color.system_neutral1_400, android.R.color.system_neutral1_500, android.R.color.system_neutral1_600,
    android.R.color.system_neutral1_700, android.R.color.system_neutral1_800, android.R.color.system_neutral1_900,
    android.R.color.system_neutral1_1000,
  )
  private val neutral2 = intArrayOf(
    android.R.color.system_neutral2_0, android.R.color.system_neutral2_10, android.R.color.system_neutral2_50,
    android.R.color.system_neutral2_100, android.R.color.system_neutral2_200, android.R.color.system_neutral2_300,
    android.R.color.system_neutral2_400, android.R.color.system_neutral2_500, android.R.color.system_neutral2_600,
    android.R.color.system_neutral2_700, android.R.color.system_neutral2_800, android.R.color.system_neutral2_900,
    android.R.color.system_neutral2_1000,
  )
}
