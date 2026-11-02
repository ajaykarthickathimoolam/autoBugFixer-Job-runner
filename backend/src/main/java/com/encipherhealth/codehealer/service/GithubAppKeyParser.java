package com.encipherhealth.codehealer.service;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;

/** Parses a GitHub App PEM (PKCS#8 or PKCS#1 RSA) into a private key. */
public final class GithubAppKeyParser {

    private static final byte[] RSA_ALGORITHM_ID = new byte[] {
            0x30, 0x0d, 0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86,
            (byte) 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
    };

    private GithubAppKeyParser() {
    }

    public static PrivateKey parse(String pem) {
        if (pem == null || pem.isBlank()) {
            throw new IllegalArgumentException("GitHub App private key is empty");
        }
        try {
            if (pem.contains("BEGIN PRIVATE KEY")) {
                return keyFromPkcs8(decodePem(pem));
            }
            if (pem.contains("BEGIN RSA PRIVATE KEY")) {
                return keyFromPkcs8(pkcs1ToPkcs8(decodePem(pem)));
            }
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("GitHub App private key could not be parsed", e);
        }
        throw new IllegalArgumentException("GitHub App private key must be a PEM RSA key");
    }

    static byte[] pkcs1ToPkcs8(byte[] pkcs1) {
        byte[] version = new byte[] {0x02, 0x01, 0x00};
        byte[] octet = der(0x04, pkcs1);
        byte[] body = concat(version, RSA_ALGORITHM_ID, octet);
        return der(0x30, body);
    }

    private static PrivateKey keyFromPkcs8(byte[] pkcs8) throws GeneralSecurityException {
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
    }

    private static byte[] decodePem(String pem) {
        String body = pem.replaceAll("-----BEGIN [^-]+-----", "")
                .replaceAll("-----END [^-]+-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(body);
    }

    private static byte[] der(int tag, byte[] content) {
        byte[] length = derLength(content.length);
        byte[] out = new byte[1 + length.length + content.length];
        out[0] = (byte) tag;
        System.arraycopy(length, 0, out, 1, length.length);
        System.arraycopy(content, 0, out, 1 + length.length, content.length);
        return out;
    }

    private static byte[] derLength(int length) {
        if (length < 128) {
            return new byte[] {(byte) length};
        }
        if (length < 256) {
            return new byte[] {(byte) 0x81, (byte) length};
        }
        return new byte[] {(byte) 0x82, (byte) (length >> 8), (byte) length};
    }

    private static byte[] concat(byte[]... parts) {
        int size = 0;
        for (byte[] part : parts) size += part.length;
        byte[] out = new byte[size];
        int offset = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, out, offset, part.length);
            offset += part.length;
        }
        return out;
    }
}
