package expo.modules.postaishare

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Compartilha o vídeo final DIRETO no app escolhido (TikTok, Instagram, YouTube, WhatsApp) — ACTION_SEND com o arquivo
 * anexado (EXTRA_STREAM, permissão de leitura temporária). Sem pacote = seletor do Android.
 * Retorna false quando o app não está instalado (o JS cai para o seletor).
 */
class PostaiShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PostaiShare")

    AsyncFunction("shareVideo") { contentUri: String, packageName: String?, text: String? ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "video/mp4"
        putExtra(Intent.EXTRA_STREAM, Uri.parse(contentUri))
        if (!text.isNullOrEmpty()) putExtra(Intent.EXTRA_TEXT, text)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (packageName != null) setPackage(packageName)
      }
      try {
        activity.startActivity(if (packageName == null) Intent.createChooser(send, "Postar vídeo") else send)
        true
      } catch (e: ActivityNotFoundException) {
        false
      }
    }
  }
}
