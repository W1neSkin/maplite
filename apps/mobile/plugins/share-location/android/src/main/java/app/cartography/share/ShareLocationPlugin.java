package app.cartography.share;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "ShareLocation",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
    }
)
public class ShareLocationPlugin extends Plugin {
    private boolean askedNotifications;

    @PluginMethod
    public void start(PluginCall call) {
        ShareService.save(getContext(), call.getString("server", ""), call.getString("token", ""), call.getString("projectId", ""), call.getString("subjectId", ""), call.getString("name", "Phone"));
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "start");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED && !askedNotifications) {
            askedNotifications = true;
            requestPermissionForAlias("notifications", call, "start");
            return;
        }
        launch(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ShareService.class));
        call.resolve();
    }

    private void launch(PluginCall call) {
        Intent intent = new Intent(getContext(), ShareService.class);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
        else getContext().startService(intent);
        call.resolve();
    }
}
