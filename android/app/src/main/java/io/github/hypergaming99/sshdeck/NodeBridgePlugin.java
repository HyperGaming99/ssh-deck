package io.github.hypergaming99.sshdeck;

import android.app.Activity;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
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
  private volatile int pendingPermId = 0;
  private static volatile NodeBridgePlugin activeInstance;
  private volatile int pendingGoogleId = 0;

  @Override
  public void load() {
    activeInstance = this;
    RNNodeJsMobileModule.listener = (channel, msg) -> {
      up = true;
      if (!EVENTS.equals(channel)) return;
      try {
        JSONObject env = new JSONObject(msg);
        if (!"message".equals(env.optString("event"))) return;
        String inner = new JSONArray(env.getString("payload")).getString(0);
        if (inner.startsWith("{\"t\":\"ks\"")) { keystore(new JSONObject(inner)); return; } // Schlüssel ein-/auspacken bleibt in Java
        if (inner.startsWith("{\"t\":\"perm\"")) { storagePerm(new JSONObject(inner)); return; } // Speicherzugriff für SFTP-Lokal anfordern
        if (inner.startsWith("{\"t\":\"openurl\"")) { openUrl(new JSONObject(inner)); return; } // Externe URL im System-Browser öffnen (z. B. Google-Login)
        if (inner.startsWith("{\"t\":\"gsignin\"")) { googleSignIn(new JSONObject(inner)); return; } // Nativer Google-Login über Google Play Services
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
      String torBin = new File(ctx.getApplicationInfo().nativeLibraryDir, "libtor.so").getAbsolutePath();
      node.startNodeWithArguments(new String[] {"node", new File(project, "entry.js").getAbsolutePath(), torBin}, builtin.getAbsolutePath(), true);
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

  private boolean hasStoragePermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      return Environment.isExternalStorageManager();
    }
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
  }

  private void sendPermResult(int id, boolean ok) {
    try {
      JSONObject res = new JSONObject();
      res.put("t", "permres").put("id", id).put("ok", ok);
      toNode(res.toString());
    } catch (Exception e) { /* ignorieren */ }
  }

  private void storagePerm(JSONObject req) {
    try {
      int id = req.getInt("id");
      if (hasStoragePermission() || getActivity() == null) {
        sendPermResult(id, hasStoragePermission());
        return;
      }
      pendingPermId = id;
      getActivity().runOnUiThread(() -> {
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
              Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
              getActivity().startActivity(i);
            } catch (Exception ex) {
              Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
              getActivity().startActivity(i);
            }
          } else {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, 9001);
          }
        } catch (Exception e) {
          pendingPermId = 0;
          sendPermResult(id, false);
        }
      });
    } catch (Exception e) { /* ignorieren */ }
  }

  private void openUrl(JSONObject req) {
    try {
      String url = req.optString("url", "");
      if (!url.startsWith("https://") && !url.startsWith("http://")) return;
      Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
    } catch (Exception e) { /* ignorieren */ }
  }

  private void sendGoogleResult(int id, String idToken, boolean canceled, String error) {
    try {
      JSONObject res = new JSONObject();
      res.put("t", "gres").put("id", id);
      if (idToken != null) res.put("idToken", idToken);
      if (canceled) res.put("canceled", true);
      if (error != null) res.put("error", error);
      toNode(res.toString());
    } catch (Exception e) { /* ignorieren */ }
  }

  private void googleSignIn(JSONObject req) {
    try {
      int id = req.getInt("id");
      String clientId = req.optString("clientId", "");
      Activity act = getActivity();
      if (act == null || clientId.isEmpty()) {
        sendGoogleResult(id, null, false, "unavailable");
        return;
      }
      pendingGoogleId = id;
      act.runOnUiThread(() -> {
        try {
          GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestIdToken(clientId)
            .build();
          GoogleSignInClient client = GoogleSignIn.getClient(act, gso);
          client.signOut().addOnCompleteListener(t -> {
            try {
              act.startActivityForResult(client.getSignInIntent(), 9002);
            } catch (Exception ex) {
              pendingGoogleId = 0;
              sendGoogleResult(id, null, false, "start_failed");
            }
          });
        } catch (Exception e) {
          pendingGoogleId = 0;
          sendGoogleResult(id, null, false, "init_failed");
        }
      });
    } catch (Exception e) { /* ignorieren */ }
  }

  public static void onGoogleResult(int resultCode, Intent data) {
    NodeBridgePlugin inst = activeInstance;
    if (inst == null) return;
    int id = inst.pendingGoogleId;
    inst.pendingGoogleId = 0;
    if (id == 0) return;
    try {
      Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
      GoogleSignInAccount account = task.getResult(ApiException.class);
      String token = account != null ? account.getIdToken() : null;
      if (token != null && !token.isEmpty()) {
        inst.sendGoogleResult(id, token, false, null);
      } else {
        inst.sendGoogleResult(id, null, false, "no_token");
      }
    } catch (ApiException e) {
      int code = e.getStatusCode();
      android.util.Log.w("SSHDeck", "GoogleSignIn ApiException code=" + code, e);
      boolean canceled = code == GoogleSignInStatusCodes.SIGN_IN_CANCELLED;
      inst.sendGoogleResult(id, null, canceled, canceled ? null : ("api_" + code));
    } catch (Exception e) {
      android.util.Log.w("SSHDeck", "GoogleSignIn error", e);
      inst.sendGoogleResult(id, null, false, "error");
    }
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    int id = pendingPermId;
    if (id != 0) {
      pendingPermId = 0;
      sendPermResult(id, hasStoragePermission());
    }
  }

  @PluginMethod
  public void send(PluginCall call) {
    String msg = call.getString("msg");
    if (up && msg != null) toNode(msg);
    call.resolve(); // vor dem Start verworfene Nachrichten wiederholt die Oberfläche (hello)
  }
}
