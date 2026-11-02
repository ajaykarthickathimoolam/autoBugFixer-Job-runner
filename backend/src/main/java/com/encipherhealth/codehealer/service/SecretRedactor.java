package com.encipherhealth.codehealer.service;

import java.util.regex.Pattern;

/** Strips credential material before a failure or log line is stored or sent onward. */
public final class SecretRedactor {

    private static final Pattern PRIVATE_KEY = Pattern.compile(
            "-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----");
    private static final Pattern ACCESS_TOKEN_URL = Pattern.compile("x-access-token:[^@\\s]+@", Pattern.CASE_INSENSITIVE);
    private static final Pattern USERINFO_URL = Pattern.compile("(https?://)[^/\\s:@]+:[^/\\s@]+@", Pattern.CASE_INSENSITIVE);
    private static final Pattern BEARER = Pattern.compile("Bearer\\s+\\S+", Pattern.CASE_INSENSITIVE);
    private static final Pattern GHP = Pattern.compile("\\bgh[psu]_[A-Za-z0-9]{16,}\\b");
    private static final Pattern GITHUB_PAT = Pattern.compile("\\bgithub_pat_[A-Za-z0-9_]{16,}\\b");
    private static final Pattern AWS = Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b");
    private static final Pattern JWT = Pattern.compile("\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b");
    private static final Pattern ASSIGNED = Pattern.compile(
            "((?:api[_-]?key|secret|password|token)\\s*[:=]\\s*['\"])[^'\"]{8,}(['\"])",
            Pattern.CASE_INSENSITIVE);

    private SecretRedactor() {
    }

    public static String redact(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String cleaned = PRIVATE_KEY.matcher(text).replaceAll("[redacted private key]");
        cleaned = ACCESS_TOKEN_URL.matcher(cleaned).replaceAll("x-access-token:***@");
        cleaned = USERINFO_URL.matcher(cleaned).replaceAll("$1***:***@");
        cleaned = BEARER.matcher(cleaned).replaceAll("Bearer ***");
        cleaned = GHP.matcher(cleaned).replaceAll("gh*_***");
        cleaned = GITHUB_PAT.matcher(cleaned).replaceAll("github_pat_***");
        cleaned = AWS.matcher(cleaned).replaceAll("AKIA***");
        cleaned = JWT.matcher(cleaned).replaceAll("[redacted jwt]");
        cleaned = ASSIGNED.matcher(cleaned).replaceAll("$1[redacted]$2");
        return cleaned;
    }
}
