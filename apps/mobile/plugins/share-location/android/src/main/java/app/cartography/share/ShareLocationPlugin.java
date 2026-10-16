package app.cartography.share;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
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
        getContext().getSharedPreferences("share-location", android.content.Context.MODE_PRIVATE).edit().putBoolean("share", true).commit();
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
    public void configure(PluginCall call) {
        boolean share = Boolean.TRUE.equals(call.getBoolean("share", false));
        boolean record = Boolean.TRUE.equals(call.getBoolean("record", false));
        getContext().getSharedPreferences("share-location", android.content.Context.MODE_PRIVATE).edit()
            .putString("server", call.getString("server", ""))
            .putString("token", call.getString("token", ""))
            .putString("projectId", call.getString("projectId", ""))
            .putString("subjectId", call.getString("subjectId", ""))
            .putString("name", call.getString("name", "Phone"))
            .putBoolean("share", share)
            .putBoolean("record", record)
            .commit();
        if (!share && !record) {
            getContext().stopService(new Intent(getContext(), ShareService.class));
            call.resolve();
            return;
        }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "configure");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED && !askedNotifications) {
            askedNotifications = true;
            requestPermissionForAlias("notifications", call, "configure");
            return;
        }
        launch(call);
    }

    @PluginMethod
    public void readTrack(PluginCall call) {
        try {
            call.resolve(new JSObject("{\"points\":" + TrackFile.read(getContext()).toString() + "}"));
        } catch (Exception error) {
            call.reject("Could not read the track");
        }
    }

    @PluginMethod
    public void clearTrack(PluginCall call) {
        TrackFile.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void rename(PluginCall call) {
        // The running service reads the name on each send, so the next fix uses it.
        getContext().getSharedPreferences("share-location", android.content.Context.MODE_PRIVATE)
            .edit()
            .putString("name", call.getString("name", "Phone"))
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void locationAllowed(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("location") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void allowRemote(PluginCall call) {
        getContext().getSharedPreferences("share-location", android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("remote", Boolean.TRUE.equals(call.getBoolean("allow", false)))
            .commit();
        call.resolve();
    }

    @PluginMethod
    public void readOutbox(PluginCall call) {
        try {
            call.resolve(new JSObject(OutboxDb.read(getContext(), call.getString("projectId", ""))));
        } catch (Exception error) {
            call.reject("Could not read the queue");
        }
    }

    @PluginMethod
    public void writeOutbox(PluginCall call) {
        try {
            OutboxDb.write(getContext(), call.getString("projectId", ""), call.getString("body", "{\"ops\":[],\"docs\":[]}"));
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not write the queue");
        }
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
