package app.cartography.share;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Reads one command while the location service is already running.
 * A force-stopped app does not get here. Push is not used.
 */
final class RemotePoll {
    private RemotePoll() {}

    /** Returns the mode that was applied, or null when nothing changed. */
    static String poll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("share-location", Context.MODE_PRIVATE);
        String server = prefs.getString("server", "");
        String token = prefs.getString("token", "");
        String projectId = prefs.getString("projectId", "");
        if (server.isEmpty() || token.isEmpty() || projectId.isEmpty()) return null;
        String base = server.endsWith("/") ? server.substring(0, server.length() - 1) : server;
        String path = base + "/api/v1/projects/" + projectId + "/devices/self/command";
        try {
            String body = http(path, token, "GET", null);
            if (body == null) return null;
            JSONObject json = new JSONObject(body);
            if (!json.has("command") || json.isNull("command")) return null;
            JSONObject command = json.getJSONObject("command");
            String id = command.getString("id");
            String mode = command.getString("mode");
            String actual = current(prefs);
            if (!prefs.getBoolean("remote", false)) {
                ack(path, token, id, actual, "remoteOff");
                return null;
            }
            boolean start = "live".equals(mode) || "track".equals(mode) || "both".equals(mode);
            if (start && context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                ack(path, token, id, "permissionDenied", "permissionDenied");
                return null;
            }
            boolean share = "live".equals(mode) || "both".equals(mode);
            boolean record = "track".equals(mode) || "both".equals(mode);
            if (!share && prefs.getBoolean("share", false)) publishStop(base, token, projectId, prefs.getString("subjectId", ""), prefs.getString("name", "Phone"));
            prefs.edit().putBoolean("share", share).putBoolean("record", record).commit();
            ack(path, token, id, mode, mode);
            return mode;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String current(SharedPreferences prefs) {
        boolean share = prefs.getBoolean("share", false);
        boolean record = prefs.getBoolean("record", false);
        if (share && record) return "both";
        if (share) return "live";
        if (record) return "track";
        return "off";
    }

    private static void ack(String path, String token, String commandId, String actual, String result) {
        try {
            JSONObject body = new JSONObject();
            body.put("commandId", commandId);
            body.put("actual", actual);
            body.put("result", result);
            http(path, token, "POST", body.toString());
        } catch (Exception ignored) {
            // The command stays pending until a later poll confirms it.
        }
    }

    private static void publishStop(String base, String token, String projectId, String subjectId, String name) {
        if (subjectId.isEmpty()) return;
        try {
            JSONObject message = new JSONObject();
            message.put("type", "device");
            message.put("id", subjectId);
            message.put("deviceId", subjectId);
            message.put("fixId", java.util.UUID.randomUUID().toString());
            message.put("sampledAt", java.time.Instant.now().toString());
            JSONObject body = new JSONObject();
            body.put("name", name);
            body.put("sharing", false);
            message.put("body", body);
            http(base + "/api/v1/projects/" + projectId + "/live", token, "POST", message.toString());
        } catch (Exception ignored) {
            // The point fades on its own if this stop is missed.
        }
    }

    private static String readBody(InputStream input) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[2048];
        int count;
        while ((count = input.read(buffer)) >= 0) out.write(buffer, 0, count);
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static String http(String url, String token, String method, String body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(8_000);
            conn.setReadTimeout(8_000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            return readBody(conn.getInputStream());
        } finally {
            conn.disconnect();
        }
    }
}
