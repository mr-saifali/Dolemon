package app.dolemon.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Storage primitive for a future offline reader. This is not yet connected to
 * the WebView or UI. Key access requires a recent Android device credential;
 * callers must handle UserNotAuthenticatedException by prompting again.
 */
final class OfflineVault {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "dolemon.offline.v1";
    private static final byte[] MAGIC = { 'D', 'O', 'L', 1 };
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    // Bounds a single item and avoids accepting arbitrary file-sized allocations.
    private static final int MAX_ITEM_BYTES = 16 * 1024 * 1024;
    private final File root;

    OfflineVault(Context context) {
        root = new File(context.getNoBackupFilesDir(), "offline-v1");
    }

    private static void requireId(String value) {
        if (value == null || value.isEmpty() || value.length() > 512) throw new IllegalArgumentException("Invalid offline item id");
    }

    private static String digest(String value) throws GeneralSecurityException {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 0xff));
        return result.toString();
    }

    private File fileFor(String accountId, String itemId) throws GeneralSecurityException {
        requireId(accountId);
        requireId(itemId);
        return new File(new File(root, digest(accountId)), digest(itemId));
    }

    private static byte[] associatedData(String accountId, String itemId) {
        // Length-prefixing avoids ambiguous concatenations and binds each ciphertext
        // to its owner and item, so files cannot be swapped between accounts.
        byte[] a = accountId.getBytes(StandardCharsets.UTF_8);
        byte[] b = itemId.getBytes(StandardCharsets.UTF_8);
        java.nio.ByteBuffer buffer = java.nio.ByteBuffer.allocate(8 + a.length + b.length);
        return buffer.putInt(a.length).put(a).putInt(b.length).put(b).array();
    }

    private static SecretKey key(boolean create) throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        if (!create) throw new GeneralSecurityException("Offline key is unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                // A timed key supports device credential confirmation on API 26+.
                .setUserAuthenticationValidityDurationSeconds(60)
                .build());
        return generator.generateKey();
    }

    void write(String accountId, String itemId, byte[] plaintext) throws GeneralSecurityException, IOException {
        File file = fileFor(accountId, itemId);
        if (plaintext == null || plaintext.length > MAX_ITEM_BYTES) throw new IllegalArgumentException("Offline item exceeds size limit");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(associatedData(accountId, itemId));
        byte[] encrypted = cipher.doFinal(plaintext);
        byte[] iv = cipher.getIV();
        if (iv.length != IV_BYTES) throw new GeneralSecurityException("Unexpected IV length");
        File parent = file.getParentFile();
        if (!parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory()) throw new IOException("Cannot create vault directory");
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream stream = atomic.startWrite();
        try {
            stream.write(MAGIC);
            stream.write(iv);
            stream.write(encrypted);
            atomic.finishWrite(stream);
        } catch (IOException | RuntimeException e) {
            atomic.failWrite(stream);
            throw e;
        }
    }

    byte[] read(String accountId, String itemId) throws GeneralSecurityException, IOException {
        File file = fileFor(accountId, itemId);
        AtomicFile atomic = new AtomicFile(file);
        byte[] blob;
        try (FileInputStream stream = atomic.openRead()) {
            // Read in bounded chunks, including the GCM authentication tag.
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n, max = MAGIC.length + IV_BYTES + MAX_ITEM_BYTES + TAG_BITS / 8;
            while ((n = stream.read(chunk)) != -1) {
                if (out.size() + n > max) throw new IOException("Offline item exceeds size limit");
                out.write(chunk, 0, n);
            }
            blob = out.toByteArray();
        }
        if (blob.length < MAGIC.length + IV_BYTES + TAG_BITS / 8 || !Arrays.equals(MAGIC, Arrays.copyOf(blob, MAGIC.length))) {
            throw new IOException("Invalid offline item");
        }
        byte[] iv = Arrays.copyOfRange(blob, MAGIC.length, MAGIC.length + IV_BYTES);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(TAG_BITS, iv));
        cipher.updateAAD(associatedData(accountId, itemId));
        return cipher.doFinal(blob, MAGIC.length + IV_BYTES, blob.length - MAGIC.length - IV_BYTES);
    }

    void remove(String accountId, String itemId) throws GeneralSecurityException {
        new AtomicFile(fileFor(accountId, itemId)).delete();
    }

    void clearAccount(String accountId) throws GeneralSecurityException, IOException {
        requireId(accountId);
        File dir = new File(root, digest(accountId));
        File[] files = dir.listFiles();
        if (files != null) for (File file : files) {
            if (!file.isFile() || !file.delete()) throw new IOException("Cannot clear offline item");
        }
        if (dir.exists() && !dir.delete()) throw new IOException("Cannot clear offline account");
    }
}
