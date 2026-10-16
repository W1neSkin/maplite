package app.cartography.share;

import android.content.Context;
import android.location.Location;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;

/** A recorded line, separate from the live point. Standing still does not add a vertex. */
final class TrackFile {
    private static final int MAX = 5000;
    private static final Object LOCK = new Object();

    private TrackFile() {}

    static void append(Context context, Location location) {
        synchronized (LOCK) {
            JSONArray points = read(context);
            JSONArray last = points.length() == 0 ? null : points.optJSONArray(points.length() - 1);
            if (last != null) {
                Location previous = new Location("");
                previous.setLongitude(last.optDouble(0));
                previous.setLatitude(last.optDouble(1));
                if (location.distanceTo(previous) < 15) return;
            }
            if (points.length() >= MAX) points.remove(0);
            try {
                JSONArray pair = new JSONArray();
                pair.put(location.getLongitude());
                pair.put(location.getLatitude());
                points.put(pair);
            } catch (Exception ignored) {
                return;
            }
            write(context, points);
        }
    }

    static JSONArray read(Context context) {
        synchronized (LOCK) {
            try {
                File file = file(context);
                if (!file.exists()) return new JSONArray();
                return new JSONArray(readText(file));
            } catch (Exception ignored) {
                return new JSONArray();
            }
        }
    }

    static void clear(Context context) {
        synchronized (LOCK) {
            write(context, new JSONArray());
        }
    }

    private static void write(Context context, JSONArray points) {
        try (FileOutputStream out = new FileOutputStream(file(context))) {
            out.write(points.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            // The next point tries again. A full disk keeps the previous file.
        }
    }

    private static String readText(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) >= 0) out.write(buffer, 0, read);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), "recorded-track.json");
    }
}
