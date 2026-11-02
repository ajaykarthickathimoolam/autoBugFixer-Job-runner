package com.encipherhealth.codehealer.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Refuses to boot when a shipped default is still configured. An empty value is treated the same way.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InsecureSecretGuard implements ApplicationRunner {

    static final Set<String> BLOCKED = Set.of(
            "",
            "dev-only-secret-change-me-min-32-chars",
            "ZGV2LW9ubHktMzItYnl0ZS1rZXktY2hhbmdlIQ==",
            "dev-shared-secret",
            "sarathi@7"
    );

    private final String jwtSecret;
    private final String encryptionKey;
    private final String sharedSecret;
    private final String adminPassword;

    public InsecureSecretGuard(
            @Value("${app.jwt.secret:}") String jwtSecret,
            @Value("${app.encryption.key:}") String encryptionKey,
            @Value("${app.job-runner.shared-secret:}") String sharedSecret,
            @Value("${app.seed.admin-password:}") String adminPassword) {
        this.jwtSecret = jwtSecret;
        this.encryptionKey = encryptionKey;
        this.sharedSecret = sharedSecret;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> blocked = blockedNames(jwtSecret, encryptionKey, sharedSecret, adminPassword);
        if (!blocked.isEmpty()) {
            throw new IllegalStateException(
                    "Refusing to start with shipped default secrets: " + String.join(", ", blocked)
                            + ". Set JWT_SECRET, APP_ENCRYPTION_KEY, JOB_RUNNER_SHARED_SECRET, and SEED_ADMIN_PASSWORD.");
        }
    }

    static List<String> blockedNames(String jwtSecret, String encryptionKey, String sharedSecret, String adminPassword) {
        List<String> names = new ArrayList<>();
        if (isBlocked(jwtSecret)) names.add("JWT_SECRET");
        if (isBlocked(encryptionKey)) names.add("APP_ENCRYPTION_KEY");
        if (isBlocked(sharedSecret)) names.add("JOB_RUNNER_SHARED_SECRET");
        if (isBlocked(adminPassword)) names.add("SEED_ADMIN_PASSWORD");
        return names;
    }

    private static boolean isBlocked(String value) {
        return value == null || BLOCKED.contains(value.trim());
    }
}
