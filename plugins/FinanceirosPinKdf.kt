package br.com.financeiros.pessoal

import android.os.Build
import android.util.Xml
import java.io.File
import java.io.FileInputStream
import org.xmlpull.v1.XmlPullParser
import org.json.JSONObject
import java.security.MessageDigest
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.Executors
import javax.crypto.SecretKeyFactory
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import javax.crypto.spec.PBEKeySpec

class FinanceirosPinKdf(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  override fun getName() = "FinanceirosPinKdf"
  @ReactMethod
  fun derive(pin: String, saltHex: String, promise: Promise) {
    if (!pin.matches(Regex("[0-9]{6,12}")) || !saltHex.matches(Regex("[a-f0-9]{32}"))) {
      promise.reject("KDF_INVALID", "Não foi possível validar os dados de acesso.")
      return
    }
    executor.execute {
      val chars = pin.toCharArray()
      val salt = ByteArray(saltHex.length / 2) { i -> saltHex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
      val spec = PBEKeySpec(chars, salt, 600000, 256)
      try {
        val result = if (Build.VERSION.SDK_INT >= 26) {
          SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } else {
          val password = pin.toByteArray(Charsets.UTF_8)
          try {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(password, "HmacSHA256"))
            var u = mac.doFinal(salt + byteArrayOf(0, 0, 0, 1))
            val output = u.copyOf()
            repeat(599999) {
              val next = mac.doFinal(u)
              u.fill(0)
              u = next
              for (i in output.indices) output[i] = (output[i].toInt() xor u[i].toInt()).toByte()
            }
            u.fill(0)
            output
          } finally { password.fill(0) }
        }
        promise.resolve(result.joinToString("") { "%02x".format(it.toInt() and 0xff) })
        result.fill(0)
      } catch (e: Exception) {
        promise.reject("KDF_ERROR", "Não foi possível preparar o acesso seguro.", e)
      } finally {
        spec.clearPassword()
        chars.fill('\u0000')
        salt.fill(0)
      }
    }
  }
  // shortcut: usa o formato privado do SecureStore 58; revisar ao atualizar o módulo.
  private fun savedSecureStoreValue(key: String): String? {
    val file = File(context.applicationInfo.dataDir, "shared_prefs/SecureStore.xml")
    if (!file.isFile) return null
    FileInputStream(file).use { stream ->
      val parser = Xml.newPullParser()
      parser.setInput(stream, "UTF-8")
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        if (event == XmlPullParser.START_TAG && parser.name == "string" && parser.getAttributeValue(null, "name") == "key_v1-$key") return parser.nextText()
        event = parser.next()
      }
    }
    return null
  }
  @ReactMethod
  fun secureStoreRevision(key: String, promise: Promise) {
    if (!key.matches(Regex("[A-Za-z0-9._-]+"))) { promise.reject("STORE_INVALID", "Referência de acesso inválida."); return }
    try {
      val encoded = savedSecureStoreValue(key)
      if (encoded == null) promise.resolve(null)
      else promise.resolve(MessageDigest.getInstance("SHA-256").digest(encoded.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 0xff) })
    } catch (e: Exception) { promise.reject("STORE_ERROR", "Não foi possível confirmar a gravação segura.", e) }
  }
  @ReactMethod
  fun hasProtectedValue(key: String, promise: Promise) {
    if (!key.matches(Regex("financeiros\\.bio\\.[a-f0-9]{32}"))) { promise.reject("STORE_INVALID", "Referência de acesso inválida."); return }
    try {
      val encoded = savedSecureStoreValue(key)
      val item = if (encoded == null) null else JSONObject(encoded)
      promise.resolve(item != null && item.optBoolean("requireAuthentication", false) && item.optString("scheme") == "aes" && item.optString("ct").isNotEmpty() && item.optString("iv").isNotEmpty())
    } catch (e: Exception) { promise.reject("STORE_ERROR", "Não foi possível confirmar o acesso protegido.", e) }
  }
  override fun invalidate() { executor.shutdown(); super.invalidate() }
}

class FinanceirosPinPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(FinanceirosPinKdf(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
