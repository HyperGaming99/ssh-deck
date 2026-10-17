package com.janeasystems.rn_nodejs_mobile;

// Der Klassenname bleibt, weil die JNI-Funktionen in native-lib.cpp danach heißen.
public class RNNodeJsMobileModule {
  public interface Listener { void onMessage(String channel, String msg); }
  public static volatile Listener listener;

  static {
    System.loadLibrary("nodejs-mobile-react-native-native-lib");
    System.loadLibrary("node");
  }

  public native void registerNodeDataDirPath(String dataDir);
  public native String getCurrentABIName();
  public native Integer startNodeWithArguments(String[] arguments, String modulesPath, boolean redirectOutputToLogcat);
  public native void sendMessageToNodeChannel(String channelName, String msg);

  // wird aus native-lib.cpp aufgerufen
  public static void sendMessageToApplication(String channelName, String msg) {
    Listener l = listener;
    if (l != null) l.onMessage(channelName, msg);
  }
}
