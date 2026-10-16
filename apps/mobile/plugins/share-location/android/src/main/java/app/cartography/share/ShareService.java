package app.cartography.share;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Keeps publishing the live point after the screen turns off.
 * A foreground notification is required. This does not store a track.
 */
public class ShareService extends Service implements LocationListener {
    private static final String PREFS = "share-location";
    private static final int NOTICE = 41;
    private static final long HEARTBEAT_MS = 20_000;
    private final ExecutorService posts = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Location last;
    private long lastSentAt;
    private boolean posting = true;

    static void save(Context context, String server, String token, String projectId, String subjectId, String name) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString("server", server)
            .putString("token", token)
            .putString("projectId", projectId)
            .putString("subjectId", subjectId)
            .putString("name", name)
            .apply();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        posting = true;
        Notification notice = notice();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTICE, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTICE, notice);
        listen();
        handler.removeCallbacks(heartbeat);
        handler.postDelayed(heartbeat, HEARTBEAT_MS);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        posting = false;
        handler.removeCallbacks(heartbeat);
        LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (manager != null) manager.removeUpdates(this);
        send(null, true);
        posts.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onLocationChanged(Location location) {
        last = location;
        if (lastSentAt == 0 || location.distanceTo(sent) > 15 || System.currentTimeMillis() - lastSentAt > HEARTBEAT_MS) send(location, false);
    }

    private Location sent = new Location("");
    private final Runnable heartbeat = new Runnable() {
        @Override
        public void run() {
            if (last != null && System.currentTimeMillis() - lastSentAt >= HEARTBEAT_MS) send(last, false);
            handler.postDelayed(this, 5_000);
        }
    };

    @SuppressLint("MissingPermission")
    private void listen() {
        LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (manager == null) return;
        try {
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5_000, 10, this);
            if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5_000, 10, this);
        } catch (SecurityException ignored) {
            stopSelf();
        }
    }

    private void send(Location location, boolean stop) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String server = prefs.getString("server", "");
        String token = prefs.getString("token", "");
        String projectId = prefs.getString("projectId", "");
        String subjectId = prefs.getString("subjectId", "");
        String name = prefs.getString("name", "Phone");
        if (server.isEmpty() || token.isEmpty() || projectId.isEmpty() || subjectId.isEmpty()) return;
        if (!stop && location != null) {
            sent.set(location);
            lastSentAt = System.currentTimeMillis();
        }
        posts.execute(() -> post(server, token, projectId, subjectId, name, location, stop));
        if (stop) prefs.edit().clear().apply();
    }

    private void post(String server, String token, String projectId, String subjectId, String name, Location location, boolean stop) {
        if (!posting && !stop) return;
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("name", name);
            body.put("sharing", !stop);
            if (!stop && location != null) {
                body.put("longitude", location.getLongitude());
                body.put("latitude", location.getLatitude());
                if (location.hasAccuracy()) body.put("horizontalAccuracyM", location.getAccuracy());
                if (location.hasSpeed()) body.put("speedMps", location.getSpeed());
                if (location.hasBearing()) body.put("courseDeg", location.getBearing());
            }
            JSONObject message = new JSONObject();
            message.put("type", "device");
            message.put("id", subjectId);
            message.put("deviceId", subjectId);
            message.put("fixId", UUID.randomUUID().toString());
            long sampled = location != null && location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
            message.put("sampledAt", Instant.ofEpochMilli(sampled).toString());
            message.put("body", body);
            String base = server.endsWith("/") ? server.substring(0, server.length() - 1) : server;
            conn = (HttpURLConnection) new URL(base + "/api/v1/projects/" + projectId + "/live").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8_000);
            conn.setReadTimeout(8_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = message.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
            conn.getResponseCode();
        } catch (Exception ignored) {
            // A missed live fix is not queued. The next one replaces it.
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private Notification notice() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel("share-location", getString(R.string.share_channel), NotificationManager.IMPORTANCE_LOW);
            manager.createNotificationChannel(channel);
        }
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, "share-location")
            : new Notification.Builder(this);
        return builder.setContentTitle(getString(R.string.share_notice)).setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build();
    }
}
