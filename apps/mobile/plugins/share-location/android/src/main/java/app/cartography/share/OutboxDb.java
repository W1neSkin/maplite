package app.cartography.share;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

/** Pending map edits. This file outlives the WebView, including after force-stop. */
final class OutboxDb {
    private static final Object LOCK = new Object();

    private OutboxDb() {}

    static String read(Context context, String projectId) {
        synchronized (LOCK) {
            SQLiteDatabase db = open(context);
            try {
                ensure(db);
                try (Cursor cursor = db.rawQuery("SELECT body FROM outbox WHERE project_id = ?", new String[] { projectId })) {
                    if (!cursor.moveToFirst()) return "{\"ops\":[],\"docs\":[]}";
                    String body = cursor.getString(0);
                    return body == null || body.isEmpty() ? "{\"ops\":[],\"docs\":[]}" : body;
                }
            } finally {
                db.close();
            }
        }
    }

    static void write(Context context, String projectId, String body) {
        synchronized (LOCK) {
            SQLiteDatabase db = open(context);
            try {
                ensure(db);
                db.execSQL("INSERT OR REPLACE INTO outbox (project_id, body) VALUES (?, ?)", new Object[] { projectId, body });
            } finally {
                db.close();
            }
        }
    }

    private static SQLiteDatabase open(Context context) {
        return context.openOrCreateDatabase("cartography.db", Context.MODE_PRIVATE, null);
    }

    private static void ensure(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS outbox (project_id TEXT PRIMARY KEY, body TEXT NOT NULL)");
    }
}
