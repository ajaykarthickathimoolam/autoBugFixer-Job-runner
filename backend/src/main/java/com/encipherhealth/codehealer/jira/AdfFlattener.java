package com.encipherhealth.codehealer.jira;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Atlassian Document Format — a JSON tree, not text — flattened to Markdown deterministically.
 *
 * <p>This class is the first thing that touches attacker-controllable input, and two of its
 * properties are load-bearing rather than cosmetic.
 *
 * <p><b>Code blocks survive verbatim, and are also extracted separately.</b> Stack traces live in
 * ADF {@code codeBlock} nodes. They are simultaneously the highest-signal input to extraction and
 * the input most easily destroyed by a naive flattener: strip the fencing and a stack trace becomes
 * a run of prose lines that Claude paraphrases instead of quoting. So {@link #toMarkdown(JsonNode)}
 * fences them (widening the fence when the payload contains one of its own), and
 * {@link #codeBlocks(JsonNode)} hands them back untouched.
 *
 * <p><b>It is total, and it is bounded.</b> Unknown node types recurse into {@code content} rather
 * than throwing, because a Jira instance can enable a macro or third-party node at any time and a
 * ticket must not become unprocessable for it. Depth and output size are capped because the tree
 * arrives from an untrusted reporter: an ADF document nested a few thousand deep is trivial to
 * author and would otherwise be a stack overflow in the intake worker, and an enormous one would be
 * a memory-pressure lever. Truncation is visible in the output rather than silent.
 *
 * <p>The conversion is deliberately lossy <em>toward readability</em>: text is not Markdown-escaped.
 * The consumers are an LLM prompt and a human reading a dashboard, and escaping every bracket to
 * survive a hypothetical re-render costs more comprehension than it buys correctness. Nothing
 * downstream re-parses this string as Markdown.
 */
@Component
public class AdfFlattener {

    /** Deep enough for any human-authored document; shallow enough that recursion cannot overflow. */
    static final int MAX_DEPTH = 48;

    /** A ticket description larger than this is not information, it is a payload. */
    static final int MAX_OUTPUT_CHARS = 240_000;

    static final int MAX_CODE_BLOCKS = 64;

    /** Generous: a full JVM stack trace with causes runs to a few thousand characters. */
    static final int MAX_CODE_BLOCK_CHARS = 32_000;

    private static final String TRUNCATION_NOTE = "\n\n_[truncated by CodeHealer: document exceeded "
            + MAX_OUTPUT_CHARS + " characters]_";

    // ===================================================================== API

    /**
     * Flatten an ADF document to Markdown.
     *
     * @param adf an ADF {@code doc} node, a bare string (Jira Server sends plain text where Cloud
     *            sends ADF), or {@code null} — all three are normal inputs, none is an error
     */
    public String toMarkdown(JsonNode adf) {
        if (adf == null || adf.isNull() || adf.isMissingNode()) {
            return "";
        }
        if (adf.isTextual()) {
            return normalizeNewlines(adf.asText(""));
        }
        String rendered = block(adf, 0);
        if (rendered.length() > MAX_OUTPUT_CHARS) {
            return rendered.substring(0, MAX_OUTPUT_CHARS) + TRUNCATION_NOTE;
        }
        return rendered;
    }

    /**
     * Every {@code codeBlock} payload in document order, verbatim — no fencing, no language header,
     * no whitespace normalisation beyond line-ending canonicalisation.
     *
     * <p>A plain-string description is handled by falling back to fenced-block extraction, so a Jira
     * Server ticket and a Jira Cloud ticket yield the same field.
     */
    public List<String> codeBlocks(JsonNode adf) {
        List<String> out = new ArrayList<>();
        if (adf == null || adf.isNull() || adf.isMissingNode()) {
            return out;
        }
        if (adf.isTextual()) {
            return fencedBlocks(adf.asText(""));
        }
        collectCodeBlocks(adf, 0, out);
        return out;
    }

    /**
     * Fenced code blocks lifted out of a Markdown string.
     *
     * <p>Lives here rather than in the dev fixture adapter because "where does a code block come
     * from" is one decision, and having two answers to it is how the fixture path quietly stops
     * exercising the same extraction inputs as the real one.
     */
    public List<String> fencedBlocks(String markdown) {
        List<String> out = new ArrayList<>();
        if (markdown == null || markdown.isEmpty()) {
            return out;
        }
        String[] lines = normalizeNewlines(markdown).split("\n", -1);
        StringBuilder current = null;
        String closing = null;
        for (String line : lines) {
            String trimmed = line.strip();
            if (current == null) {
                int run = leadingBacktickRun(trimmed);
                if (run >= 3) {
                    closing = "`".repeat(run);
                    current = new StringBuilder();
                }
                continue;
            }
            if (trimmed.startsWith(closing) && trimmed.chars().allMatch(c -> c == '`')) {
                out.add(cap(current.toString(), MAX_CODE_BLOCK_CHARS));
                current = null;
                closing = null;
                if (out.size() >= MAX_CODE_BLOCKS) {
                    return out;
                }
                continue;
            }
            if (current.length() > 0) {
                current.append('\n');
            }
            current.append(line);
        }
        // An unterminated fence is still a stack trace to whoever pasted it.
        if (current != null && !current.isEmpty()) {
            out.add(cap(current.toString(), MAX_CODE_BLOCK_CHARS));
        }
        return out;
    }

    // ============================================================ block layer

    private String block(JsonNode node, int depth) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        if (depth > MAX_DEPTH) {
            // Marked rather than dropped: a reader must be able to tell "nothing was here" from
            // "CodeHealer refused to descend further", and a hostile document should look hostile.
            return "_[truncated by CodeHealer: nesting exceeded " + MAX_DEPTH + " levels]_";
        }
        if (node.isTextual()) {
            return normalizeNewlines(node.asText(""));
        }
        String type = type(node);
        return switch (type) {
            case "doc" -> blocks(node.path("content"), depth + 1);
            case "paragraph" -> inlineAll(node.path("content"), depth + 1).strip();
            case "heading" -> heading(node, depth);
            case "bulletList" -> list(node, depth, false);
            case "orderedList" -> list(node, depth, true);
            case "listItem" -> blocks(node.path("content"), depth + 1);
            case "codeBlock" -> fencedCodeBlock(node);
            case "blockquote" -> prefixLines(blocks(node.path("content"), depth + 1), "> ", ">");
            case "panel" -> panel(node, depth);
            case "rule" -> "---";
            case "table" -> table(node, depth);
            case "tableRow", "tableCell", "tableHeader" -> blocks(node.path("content"), depth + 1);
            case "mediaSingle", "mediaGroup" -> blocks(node.path("content"), depth + 1);
            case "media" -> mediaLabel(node);
            case "expand", "nestedExpand" -> expand(node, depth);
            default -> {
                if (node.path("content").isArray()) {
                    yield blocks(node.path("content"), depth + 1);
                }
                yield inline(node, depth + 1).strip();
            }
        };
    }

    /** Join block-level children with a blank line, stopping once the output budget is spent. */
    private String blocks(JsonNode content, int depth) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode child : children(content)) {
            if (sb.length() > MAX_OUTPUT_CHARS) {
                break;
            }
            String rendered = block(child, depth);
            if (rendered == null || rendered.isBlank()) {
                continue;
            }
            if (!sb.isEmpty()) {
                sb.append("\n\n");
            }
            sb.append(rendered.stripTrailing());
        }
        return sb.toString();
    }

    private String heading(JsonNode node, int depth) {
        int level = Math.clamp(node.path("attrs").path("level").asInt(1), 1, 6);
        String text = inlineAll(node.path("content"), depth + 1).strip();
        return text.isEmpty() ? "" : "#".repeat(level) + " " + text;
    }

    private String list(JsonNode node, int depth, boolean ordered) {
        int start = ordered ? Math.max(1, node.path("attrs").path("order").asInt(1)) : 1;
        StringBuilder sb = new StringBuilder();
        int index = 0;
        for (JsonNode item : children(node.path("content"))) {
            String body = block(item, depth + 1);
            if (body.isBlank()) {
                continue;
            }
            String marker = ordered ? (start + index) + ". " : "- ";
            String continuation = " ".repeat(marker.length());
            String[] lines = body.split("\n", -1);
            for (int i = 0; i < lines.length; i++) {
                if (!sb.isEmpty()) {
                    sb.append('\n');
                }
                if (i == 0) {
                    sb.append(marker).append(lines[i]);
                } else if (!lines[i].isEmpty()) {
                    sb.append(continuation).append(lines[i]);
                }
            }
            index++;
        }
        return sb.toString().stripTrailing();
    }

    /**
     * A fenced block whose fence is always longer than any backtick run inside it — otherwise a
     * ticket containing its own triple-backtick fence would terminate ours early and spill the rest
     * of the trace into the surrounding prose.
     */
    private String fencedCodeBlock(JsonNode node) {
        String code = rawText(node);
        String language = node.path("attrs").path("language").asText("");
        int fenceLength = 3;
        for (String line : code.split("\n", -1)) {
            fenceLength = Math.max(fenceLength, leadingBacktickRun(line.strip()) + 1);
        }
        String fence = "`".repeat(fenceLength);
        return fence + sanitizeLanguage(language) + "\n" + cap(code, MAX_CODE_BLOCK_CHARS) + "\n" + fence;
    }

    private String panel(JsonNode node, int depth) {
        String kind = node.path("attrs").path("panelType").asText("info").toUpperCase(Locale.ROOT);
        String body = blocks(node.path("content"), depth + 1);
        String header = "**[" + kind.replaceAll("[^A-Z0-9_]", "") + "]**";
        String combined = body.isBlank() ? header : header + "\n" + body;
        return prefixLines(combined, "> ", ">");
    }

    private String expand(JsonNode node, int depth) {
        String title = node.path("attrs").path("title").asText("").strip();
        String body = blocks(node.path("content"), depth + 1);
        if (title.isEmpty()) {
            return body;
        }
        return body.isBlank() ? "**" + title + "**" : "**" + title + "**\n\n" + body;
    }

    /**
     * GFM tables need a header row, and ADF does not guarantee one. The first row is promoted
     * regardless: a table rendered with its first data row as a header still reads correctly, while
     * a table with no separator line stops being a table at all.
     */
    private String table(JsonNode node, int depth) {
        List<List<String>> rows = new ArrayList<>();
        for (JsonNode row : children(node.path("content"))) {
            if (!"tableRow".equals(type(row))) {
                continue;
            }
            List<String> cells = new ArrayList<>();
            for (JsonNode cell : children(row.path("content"))) {
                String cellType = type(cell);
                if (!"tableCell".equals(cellType) && !"tableHeader".equals(cellType)) {
                    continue;
                }
                cells.add(cellText(cell, depth + 1));
            }
            rows.add(cells);
        }
        int width = rows.stream().mapToInt(List::size).max().orElse(0);
        if (width == 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < rows.size(); r++) {
            sb.append(rowLine(rows.get(r), width)).append('\n');
            if (r == 0) {
                sb.append("|");
                for (int c = 0; c < width; c++) {
                    sb.append(" --- |");
                }
                sb.append('\n');
            }
        }
        return sb.toString().stripTrailing();
    }

    private String cellText(JsonNode cell, int depth) {
        String body = blocks(cell.path("content"), depth);
        return body.replace("|", "\\|").replace("\n", " ").strip();
    }

    private static String rowLine(List<String> cells, int width) {
        StringBuilder sb = new StringBuilder("|");
        for (int c = 0; c < width; c++) {
            sb.append(' ').append(c < cells.size() ? cells.get(c) : "").append(" |");
        }
        return sb.toString();
    }

    private static String mediaLabel(JsonNode node) {
        JsonNode attrs = node.path("attrs");
        String name = firstNonBlank(
                attrs.path("alt").asText(""),
                attrs.path("__fileName").asText(""),
                attrs.path("id").asText(""));
        return name.isBlank() ? "_[media]_" : "_[media: " + singleLine(name) + "]_";
    }

    // =========================================================== inline layer

    private String inlineAll(JsonNode content, int depth) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode child : children(content)) {
            if (sb.length() > MAX_OUTPUT_CHARS) {
                break;
            }
            sb.append(inline(child, depth));
        }
        return sb.toString();
    }

    private String inline(JsonNode node, int depth) {
        if (node == null || node.isMissingNode() || node.isNull() || depth > MAX_DEPTH) {
            return "";
        }
        if (node.isTextual()) {
            return node.asText("");
        }
        JsonNode attrs = node.path("attrs");
        return switch (type(node)) {
            case "text" -> marked(node);
            case "hardBreak" -> "\n";
            case "mention" -> mention(attrs);
            case "emoji" -> firstNonBlank(attrs.path("text").asText(""),
                    attrs.path("shortName").asText(""));
            case "inlineCard" -> inlineCard(attrs);
            case "status" -> {
                String text = singleLine(attrs.path("text").asText("")).strip();
                yield text.isEmpty() ? "" : "`[" + text + "]`";
            }
            case "date" -> singleLine(attrs.path("timestamp").asText(""));
            case "media" -> mediaLabel(node);
            default -> {
                if (node.path("content").isArray()) {
                    yield inlineAll(node.path("content"), depth + 1);
                }
                yield node.path("text").asText("");
            }
        };
    }

    /** Marks applied innermost-out: code, then emphasis, then the link wrapper. */
    private String marked(JsonNode node) {
        String text = node.path("text").asText("");
        if (text.isEmpty()) {
            return "";
        }
        boolean code = false;
        boolean strong = false;
        boolean em = false;
        boolean strike = false;
        String href = null;
        for (JsonNode mark : children(node.path("marks"))) {
            switch (type(mark)) {
                case "code" -> code = true;
                case "strong" -> strong = true;
                case "em" -> em = true;
                case "strike" -> strike = true;
                case "link" -> href = mark.path("attrs").path("href").asText("");
                default -> { }
            }
        }
        if (code) {
            int longest = 0;
            int run = 0;
            for (char c : text.toCharArray()) {
                run = c == '`' ? run + 1 : 0;
                longest = Math.max(longest, run);
            }
            String delimiter = "`".repeat(longest + 1);
            String pad = (text.startsWith("`") || text.endsWith("`")) ? " " : "";
            text = delimiter + pad + text + pad + delimiter;
        }
        if (strong) {
            text = "**" + text + "**";
        }
        if (em) {
            text = "*" + text + "*";
        }
        if (strike) {
            text = "~~" + text + "~~";
        }
        if (href != null && !href.isBlank()) {
            String clean = singleLine(href).strip();
            String scheme = clean.toLowerCase(Locale.ROOT);
            // Only well-known schemes get link syntax. An exotic scheme is still shown — dropping a
            // URL out of a bug report loses evidence — but it is shown as text a reader must copy.
            if (scheme.startsWith("http://") || scheme.startsWith("https://") || scheme.startsWith("mailto:")) {
                text = "[" + text + "](" + clean.replace(")", "%29") + ")";
            } else {
                text = text + " (" + clean + ")";
            }
        }
        return text;
    }

    private static String mention(JsonNode attrs) {
        String text = singleLine(attrs.path("text").asText("")).strip();
        if (!text.isEmpty()) {
            return text.startsWith("@") ? text : "@" + text;
        }
        String id = singleLine(attrs.path("id").asText("")).strip();
        return id.isEmpty() ? "" : "@" + id;
    }

    private static String inlineCard(JsonNode attrs) {
        String url = singleLine(attrs.path("url").asText("")).strip();
        if (url.isEmpty()) {
            JsonNode data = attrs.path("data");
            url = singleLine(data.path("url").asText("")).strip();
        }
        return url.isEmpty() ? "" : "<" + url + ">";
    }

    // ================================================================ walkers

    private void collectCodeBlocks(JsonNode node, int depth, List<String> out) {
        if (node == null || node.isMissingNode() || node.isNull()
                || depth > MAX_DEPTH || out.size() >= MAX_CODE_BLOCKS) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : children(node)) {
                collectCodeBlocks(child, depth + 1, out);
            }
            return;
        }
        if (!node.isObject()) {
            return;
        }
        if ("codeBlock".equals(type(node))) {
            String code = cap(rawText(node), MAX_CODE_BLOCK_CHARS);
            if (!code.isBlank()) {
                out.add(code);
            }
            return;
        }
        collectCodeBlocks(node.path("content"), depth + 1, out);
    }

    /** Concatenated text of a node's direct children, with nothing added and nothing removed. */
    private static String rawText(JsonNode node) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode child : children(node.path("content"))) {
            if ("hardBreak".equals(type(child))) {
                sb.append('\n');
            } else {
                sb.append(child.path("text").asText(""));
            }
        }
        return normalizeNewlines(sb.toString());
    }

    // ================================================================ helpers

    private static List<JsonNode> children(JsonNode node) {
        List<JsonNode> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode child : node) {
                out.add(child);
            }
        }
        return out;
    }

    private static String type(JsonNode node) {
        return node == null ? "" : node.path("type").asText("");
    }

    private static String prefixLines(String body, String prefix, String emptyPrefix) {
        if (body == null || body.isBlank()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (String line : body.split("\n", -1)) {
            if (!sb.isEmpty()) {
                sb.append('\n');
            }
            sb.append(line.isEmpty() ? emptyPrefix : prefix + line);
        }
        return sb.toString();
    }

    /** A language token is echoed into a fence header, so it is bounded to an identifier shape. */
    private static String sanitizeLanguage(String language) {
        if (language == null) {
            return "";
        }
        String clean = language.strip().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9+#._-]", "");
        return clean.length() > 24 ? "" : clean;
    }

    private static String normalizeNewlines(String s) {
        return s == null ? "" : s.replace("\r\n", "\n").replace('\r', '\n');
    }

    private static String singleLine(String s) {
        return s == null ? "" : normalizeNewlines(s).replace('\n', ' ').replace('\t', ' ');
    }

    private static int leadingBacktickRun(String line) {
        int run = 0;
        while (run < line.length() && line.charAt(run) == '`') {
            run++;
        }
        return run;
    }

    private static String cap(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max) + "\n… [truncated by CodeHealer]";
    }

    private static String firstNonBlank(String... candidates) {
        for (String candidate : candidates) {
            if (candidate != null && !candidate.isBlank()) {
                return candidate;
            }
        }
        return "";
    }
}
