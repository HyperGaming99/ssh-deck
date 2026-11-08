package io.github.hypergaming99.sshdeck;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(NodeBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == 9002) {
      NodeBridgePlugin.onGoogleResult(resultCode, data);
    }
  }
}
