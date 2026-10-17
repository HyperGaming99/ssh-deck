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
        JSObject o = new JSObject();
        o.put("msg", new JSONArray(env.getString("payload")).getString(0));
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

  @PluginMethod
  public void send(PluginCall call) {
    String msg = call.getString("msg");
    if (up && msg != null) {
      try {
        JSONObject env = new JSONObject();
        env.put("event", "message");
        env.put("payload", new JSONArray().put(msg).toString());
        node.sendMessageToNodeChannel(EVENTS, env.toString());
      } catch (Exception e) { /* ignorieren */ }
    }
    call.resolve(); // vor dem Start verworfene Nachrichten wiederholt die Oberfläche (hello)
  }
}
