package io.github.hypergaming99.sshdeck;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(NodeBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
