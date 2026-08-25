package com.encipherhealth.codehealer.jira;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The small text disciplines that every Jira boundary shares, in one place so the two
 * {@code JiraPort} implementations and the write-back service cannot drift apart on them.
 *
 * <p>The issue-key check is the interesting one. An issue key reaches this package from a webhook
 * body, a JQL result, a fixture filename, and every internal caller, and it is then interpolated
 * into a REST path segment and — in dev mode — into a filesystem path. {@code UriBuilder} encoding
 * covers the first use; nothing covers the second. Validating the key against Jira's own grammar at
 * the boundary removes the whole class of "key" values that are really traversal attempts, and it
 * removes it once rather than at each call site.
 */
public final class JiraText {

    /** Jira's project-key grammar: an uppercase alphanumeric prefix, a hyphen, a positive integer. */
    private static final Pattern ISSUE_KEY = Pattern.compile("[A-Z][A-Z0-9_]{0,63}-[0-9]{1,12}");

    /** Jira rejects labels containing whitespace outright; the call fails with a 400 if we let one through. */
    private static final Pattern LABEL_ILLEGAL = Pattern.compile("[\\s\"']+");

    private JiraText() {
    }

    /**
     * @return the key, uppercased and trimmed
     * @throws IllegalArgumentException when the value is not a Jira issue key — callers treat this as
     *         a programming or spoofing error, never as a retryable condition
     */
    public static String requireIssueKey(String issueKey) {
        String candidate = issueKey == null ? "" : issueKey.strip().toUpperCase(Locale.ROOT);
        if (!ISSUE_KEY.matcher(candidate).matches()) {
            throw new IllegalArgumentException("not a Jira issue key: " + abbreviate(issueKey, 64));
        }
        return candidate;
    }

    public static boolean isIssueKey(String issueKey) {
        return issueKey != null && ISSUE_KEY.matcher(issueKey.strip().toUpperCase(Locale.ROOT)).matches();
    }

    /**
     * Strip everything that would break an ADF text node or a log line: C0 controls other than tab
     * and newline, the C1 range, DEL, and the byte-order mark. Lone surrogates go too — they survive
     * a Java {@code String} but not a UTF-8 round trip through Jira's parser.
     */
    static String stripControlChars(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        String normalized = s.replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder sb = new StringBuilder(normalized.length());
        for (int i = 0; i < normalized.length(); i++) {
            char c = normalized.charAt(i);
            if (c == '\n' || c == '\t') {
                sb.append(c);
                continue;
            }
            if (c < 0x20 || c == 0x7F || (c >= 0x80 && c <= 0x9F) || c == '\uFEFF') {
                continue;
            }
            if (Character.isHighSurrogate(c)) {
                if (i + 1 < normalized.length() && Character.isLowSurrogate(normalized.charAt(i + 1))) {
                    sb.append(c).append(normalized.charAt(i + 1));
                    i++;
                }
                continue;
            }
            if (Character.isLowSurrogate(c)) {
                continue;
            }
            sb.append(c);
        }
        return sb.toString();
    }

    /** Collapse to a single line — for labels, titles, and log lines that must not wrap. */
    static String singleLine(String s) {
        return stripControlChars(s).replace('\n', ' ').replace('\t', ' ').strip();
    }

    static String cap(String s, int max) {
        if (s == null) {
            return "";
        }
        if (s.length() <= max) {
            return s;
        }
        return s.substring(0, max) + "… [truncated]";
    }

    static String abbreviate(String s, int max) {
        if (s == null) {
            return "null";
        }
        String clean = singleLine(s);
        return clean.length() <= max ? clean : clean.substring(0, max) + "…";
    }

    /** Jira labels are single tokens; spaces and quotes become hyphens rather than a 400. */
    static String toLabel(String label) {
        String clean = LABEL_ILLEGAL.matcher(singleLine(label)).replaceAll("-");
        return cap(clean, 255);
    }

    public static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /**
     * Jira Cloud emits {@code 2024-05-01T12:34:56.789+0000} — an offset without a colon, which
     * {@code ISO_OFFSET_DATE_TIME} refuses. Jira Server and hand-written fixtures use other
     * dialects again, so the parse is a short ladder rather than one format.
     *
     * @return the instant, or {@code null} when no dialect matched — callers decide how loud that is
     */
    static Instant parseTimestamp(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String candidate = value.strip();
        for (DateTimeFormatter formatter : TIMESTAMPS) {
            try {
                return OffsetDateTime.parse(candidate, formatter).toInstant();
            } catch (DateTimeException ignored) {
                // Try the next dialect; Jira has shipped several.
            }
        }
        try {
            return Instant.parse(candidate);
        } catch (DateTimeException ignored) {
            return null;
        }
    }

    private static final List<DateTimeFormatter> TIMESTAMPS = List.of(
            DateTimeFormatter.ISO_OFFSET_DATE_TIME,
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.ROOT),
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssZ", Locale.ROOT));
}
