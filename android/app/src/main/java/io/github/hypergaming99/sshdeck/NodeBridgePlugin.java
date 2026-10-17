package io.github.hypergaming99.sshdeck;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.janeasystems.rn_nodejs_mobile.RNNodeJsMobileModule;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;

// Startet Node.js (nodejs-mobile) in der App und reicht Textnachrichten zwischen WebView und Node durch.
@CapacitorPlugin(name = "NodeBridge")
public class NodeBridgePlugin extends Plugin {
  private static final String EVENTS = "_EVENTS_";
  private final RNNodeJsMobileModule node = new RNNodeJsMobileModule();
  private volatile boolean up = false; // erst wenn Node etwas gesendet hat, ist sein Kanal bereit

  @Override
  public void load() {
    RNNodeJsMobileModule.listener = (channel, msg) -> {
      up = true;
      if (!EVENTS.equals(channel)) return;
      try {
        JSONObject env = new JSONObject(msg);
        if (!"message".equals(env.optString("event"))) return;
        String inner = new JSONArray(env.getString("payload")).getString(0);
        if (inner.startsWith("{\"t\":\"ks\"")) { keystore(new JSONObject(inner)); return; } // Schlüssel ein-/auspacken bleibt in Java
        JSObject o = new JSObject();
        o.put("msg", inner);
        notifyListeners("message", o);
      } catch (Exception e) { /* ignorieren */ }
    };
    Thread t = new Thread(null, this::start, "node", 4 * 1024 * 1024);
    t.start();
  }

  private void start() {
    try {
      Context ctx = getContext();
      File files = ctx.getFilesDir();
      File project = new File(files, "nodejs-project");
      File builtin = new File(files, "nodejs-builtin_modules");
      String stamp = String.valueOf(ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).lastUpdateTime);
      File stampFile = new File(files, "nodejs-stamp");
      if (!stampFile.exists() || !stamp.equals(new String(java.nio.file.Files.readAllBytes(stampFile.toPath())))) {
        deleteAll(project); deleteAll(builtin);
        copyAssets("nodejs", project);
        copyAssets("nodejs-builtin_modules", builtin);
        java.nio.file.Files.write(stampFile.toPath(), stamp.getBytes());
      }
      node.registerNodeDataDirPath(files.getAbsolutePath());
      node.startNodeWithArguments(new String[] {"node", new File(project, "entry.js").getAbsolutePath()}, builtin.getAbsolutePath(), true);
    } catch (Exception e) {
      android.util.Log.e("SSHDeck", "Node-Start fehlgeschlagen", e);
    }
  }

  private void copyAssets(String from, File to) throws Exception {
    String[] list = getContext().getAssets().list(from);
    if (list == null || list.length == 0) { // Datei
      to.getParentFile().mkdirs();
      try (InputStream in = getContext().getAssets().open(from); OutputStream out = new FileOutputStream(to)) {
        byte[] buf = new byte[65536]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      }
      return;
    }
    to.mkdirs();
    for (String f : list) copyAssets(from + "/" + f, new File(to, f));
  }

  private static void deleteAll(File f) {
    File[] c = f.listFiles();
    if (c != null) for (File x : c) deleteAll(x);
    f.delete();
  }

  private void toNode(String msg) {
    try {
      JSONObject env = new JSONObject();
      env.put("event", "message");
      env.put("payload", new JSONArray().put(msg).toString());
      node.sendMessageToNodeChannel(EVENTS, env.toString());
    } catch (Exception e) { /* ignorieren */ }
  }

  // Android Keystore: AES-256-GCM-Schlüssel "ssh-deck-secret", nicht auslesbar. wrap/unwrap = iv(12) + Chiffre.
  private SecretKey ksKey() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (!ks.containsAlias("ssh-deck-secret")) {
      KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      g.init(new KeyGenParameterSpec.Builder("ssh-deck-secret", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
      g.generateKey();
    }
    return (SecretKey) ks.getKey("ssh-deck-secret", null);
  }

  private void keystore(JSONObject req) {
    JSONObject res = new JSONObject();
    try {
      res.put("t", "ksres").put("id", req.getInt("id"));
      byte[] data = Base64.decode(req.getString("data"), Base64.NO_WRAP);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      byte[] out;
      if ("wrap".equals(req.getString("op"))) {
        c.init(Cipher.ENCRYPT_MODE, ksKey());
        byte[] enc = c.doFinal(data), iv = c.getIV();
        out = new byte[iv.length + enc.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(enc, 0, out, iv.length, enc.length);
      } else {
        c.init(Cipher.DECRYPT_MODE, ksKey(), new GCMParameterSpec(128, data, 0, 12));
        out = c.doFinal(data, 12, data.length - 12);
      }
      res.put("data", Base64.encodeToString(out, Base64.NO_WRAP));
    } catch (Exception e) {
      try { res.put("error", String.valueOf(e.getMessage())); } catch (Exception x) { /* ignorieren */ }
    }
    toNode(res.toString());
  }

  @PluginMethod
  public void send(PluginCall call) {
    String msg = call.getString("msg");
    if (up && msg != null) toNode(msg);
    call.resolve(); // vor dem Start verworfene Nachrichten wiederholt die Oberfläche (hello)
  }
}
