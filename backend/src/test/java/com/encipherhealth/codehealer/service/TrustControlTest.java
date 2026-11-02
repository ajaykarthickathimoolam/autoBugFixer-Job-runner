package com.encipherhealth.codehealer.service;

import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrustControlTest {

    @Test
    void redactsGitHubTokens() {
        String raw = "https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz123456@github.com/org/repo.git";
        String cleaned = SecretRedactor.redact(raw);
        assertFalse(cleaned.contains("ghp_abcdefghijklmnopqrstuvwxyz123456"));
        assertTrue(cleaned.contains("github.com/org/repo.git"));
    }

    @Test
    void refusesShippedDefaults() {
        assertEquals(
                java.util.List.of("JWT_SECRET", "APP_ENCRYPTION_KEY", "JOB_RUNNER_SHARED_SECRET", "SEED_ADMIN_PASSWORD"),
                InsecureSecretGuard.blockedNames(
                        "dev-only-secret-change-me-min-32-chars",
                        "ZGV2LW9ubHktMzItYnl0ZS1rZXktY2hhbmdlIQ==",
                        "dev-shared-secret",
                        "sarathi@7"));
        assertTrue(InsecureSecretGuard.blockedNames("a-real-jwt-secret-value-here", "another-real-key", "another-shared", "not-the-default").isEmpty());
    }

    @Test
    void parsesPkcs8Pem() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        String pem = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(pair.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
        RSAPrivateCrtKey parsed = (RSAPrivateCrtKey) GithubAppKeyParser.parse(pem);
        assertEquals(((RSAPrivateCrtKey) pair.getPrivate()).getModulus(), parsed.getModulus());
    }
}
