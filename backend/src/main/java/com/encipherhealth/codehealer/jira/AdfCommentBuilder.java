package com.encipherhealth.codehealer.jira;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * The inverse of {@link AdfFlattener}: a rendered comment body becomes the ADF document Jira Cloud
 * requires on the comment endpoint.
 *
 * <p><b>It interprets markup at line level only, never inside a line.</b> That restriction is the
 * whole security argument for the write-back's rendering discipline. Machine-extracted text is
 * emitted with every one of its lines prefixed {@code "> "}, and the block
 * rules below dispatch on the raw line prefix — so a quoted line reading {@code ``` } arrives as
 * {@code "> ``` "} and is quote content, not a fence, and a quoted line reading {@code **CodeHealer**}
 * arrives as {@code "> **CodeHealer**"} and is quote content, not a heading. There is no inline span
 * parser for it to escape through, because there is no inline span parser. An injected ticket
 * therefore cannot borrow CodeHealer's own typography to make its text look like CodeHealer's words.
 *
 * <p>The line vocabulary is exactly what the templates need and nothing more: a bold line for
 * section headings, a whole-line HTTP link for the one PR link, {@code "- "} bullets, {@code "---"}
 * rules, {@code "> "} quotes, and {@code ```} fences that carry stack traces back to the ticket
 * unaltered. Everything else is a plain paragraph.
 */
final class AdfCommentBuilder {

    /** Jira rejects comment bodies past its own limit; failing here beats a 400 at the API. */
    static final int MAX_BODY_CHARS = 30_000;

    static final int MAX_BLOCKS = 400;

    private static final String EMPTY_COMMENT_TEXT = "(no content)";

    private AdfCommentBuilder() {
    }

    static ObjectNode document(ObjectMapper mapper, String renderedBody) {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("type", "doc");
        doc.put("version", 1);
        ArrayNode content = doc.putArray("content");

        for (JsonNode block : blocks(mapper, renderedBody)) {
            if (content.size() >= MAX_BLOCKS) {
                break;
            }
            content.add(block);
        }
        if (content.isEmpty()) {
            content.add(paragraph(mapper, EMPTY_COMMENT_TEXT));
        }
        return doc;
    }

    private static List<JsonNode> blocks(ObjectMapper mapper, String renderedBody) {
        List<JsonNode> out = new ArrayList<>();
        String body = JiraText.cap(JiraText.stripControlChars(renderedBody), MAX_BODY_CHARS);
        if (body.isBlank()) {
            return out;
        }

        String[] lines = body.split("\n", -1);
        int i = 0;
        while (i < lines.length && out.size() < MAX_BLOCKS) {
            String line = lines[i];
            String trimmed = line.strip();

            if (trimmed.startsWith("```")) {
                i = codeBlock(mapper, lines, i, out);
                continue;
            }
            if (line.startsWith(">")) {
                i = blockquote(mapper, lines, i, out);
                continue;
            }
            if (line.startsWith("- ")) {
                i = bulletList(mapper, lines, i, out);
                continue;
            }
            if (trimmed.equals("---") || trimmed.equals("***")) {
                ObjectNode rule = mapper.createObjectNode();
                rule.put("type", "rule");
                out.add(rule);
                i++;
                continue;
            }
            if (!trimmed.isEmpty()) {
                out.add(lineParagraph(mapper, trimmed));
            }
            i++;
        }
        return out;
    }

    /**
     * Consume a fenced run. The fence token is matched by length so a payload containing a shorter
     * fence cannot close a longer one — the same widening rule {@link AdfFlattener} applies when it
     * writes the fence in the first place.
     */
    private static int codeBlock(ObjectMapper mapper, String[] lines, int start, List<JsonNode> out) {
        String opening = lines[start].strip();
        int fenceLength = 0;
        while (fenceLength < opening.length() && opening.charAt(fenceLength) == '`') {
            fenceLength++;
        }
        String language = sanitizeLanguage(opening.substring(fenceLength));

        StringBuilder code = new StringBuilder();
        int i = start + 1;
        while (i < lines.length) {
            String candidate = lines[i].strip();
            if (isFence(candidate, fenceLength)) {
                i++;
                break;
            }
            if (!code.isEmpty()) {
                code.append('\n');
            }
            code.append(lines[i]);
            i++;
        }

        String text = code.toString();
        if (!text.isBlank()) {
            ObjectNode node = mapper.createObjectNode();
            node.put("type", "codeBlock");
            if (!language.isEmpty()) {
                node.putObject("attrs").put("language", language);
            }
            node.putArray("content").add(textNode(mapper, text, null, null));
            out.add(node);
        }
        return i;
    }

    private static int blockquote(ObjectMapper mapper, String[] lines, int start, List<JsonNode> out) {
        ObjectNode quote = mapper.createObjectNode();
        quote.put("type", "blockquote");
        ArrayNode content = quote.putArray("content");

        int i = start;
        while (i < lines.length && lines[i].startsWith(">")) {
            String inner = lines[i].substring(1);
            if (inner.startsWith(" ")) {
                inner = inner.substring(1);
            }
            String text = inner.strip();
            if (!text.isEmpty()) {
                // Plain text only: quoted content is never given marks, links, or nested structure.
                content.add(paragraph(mapper, inner));
            }
            i++;
        }
        if (!content.isEmpty()) {
            out.add(quote);
        }
        return i;
    }

    private static int bulletList(ObjectMapper mapper, String[] lines, int start, List<JsonNode> out) {
        ObjectNode list = mapper.createObjectNode();
        list.put("type", "bulletList");
        ArrayNode items = list.putArray("content");

        int i = start;
        while (i < lines.length && lines[i].startsWith("- ")) {
            String text = lines[i].substring(2).strip();
            if (!text.isEmpty()) {
                ObjectNode item = mapper.createObjectNode();
                item.put("type", "listItem");
                item.putArray("content").add(lineParagraph(mapper, text));
                items.add(item);
            }
            i++;
        }
        if (items.isEmpty()) {
            return i;
        }
        out.add(list);
        return i;
    }

    /**
     * A paragraph carrying the only two line-level decorations the templates use. Both require the
     * <em>entire</em> line to match, which is what keeps them out of reach of quoted content.
     */
    private static ObjectNode lineParagraph(ObjectMapper mapper, String line) {
        if (line.length() > 4 && line.startsWith("**") && line.endsWith("**")) {
            String inner = line.substring(2, line.length() - 2).strip();
            if (!inner.isEmpty() && !inner.contains("**")) {
                return paragraph(mapper, inner, "strong", null);
            }
        }
        String href = wholeLineLink(line);
        if (href != null) {
            String text = line.substring(1, line.indexOf("](")).strip();
            return paragraph(mapper, text.isEmpty() ? href : text, null, href);
        }
        return paragraph(mapper, line);
    }

    /** @return the target of a whole-line {@code [text](https://…)} form, or {@code null} */
    private static String wholeLineLink(String line) {
        if (!line.startsWith("[") || !line.endsWith(")")) {
            return null;
        }
        int split = line.indexOf("](");
        if (split < 1) {
            return null;
        }
        String href = line.substring(split + 2, line.length() - 1).strip();
        String lower = href.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            return null;
        }
        if (href.contains(" ") || href.contains("(") || href.contains(")")) {
            return null;
        }
        return href;
    }

    private static ObjectNode paragraph(ObjectMapper mapper, String text) {
        return paragraph(mapper, text, null, null);
    }

    private static ObjectNode paragraph(ObjectMapper mapper, String text, String mark, String href) {
        ObjectNode node = mapper.createObjectNode();
        node.put("type", "paragraph");
        ArrayNode content = node.putArray("content");
        if (!text.isEmpty()) {
            content.add(textNode(mapper, text, mark, href));
        }
        return node;
    }

    /** ADF rejects an empty {@code text} node outright, so callers must not build one. */
    private static ObjectNode textNode(ObjectMapper mapper, String text, String mark, String href) {
        ObjectNode node = mapper.createObjectNode();
        node.put("type", "text");
        node.put("text", text.isEmpty() ? " " : text);
        if (mark != null || href != null) {
            ArrayNode marks = node.putArray("marks");
            if (mark != null) {
                marks.add(mapper.createObjectNode().put("type", mark));
            }
            if (href != null) {
                ObjectNode link = mapper.createObjectNode();
                link.put("type", "link");
                link.putObject("attrs").put("href", href);
                marks.add(link);
            }
        }
        return node;
    }

    private static boolean isFence(String candidate, int fenceLength) {
        if (candidate.length() < fenceLength) {
            return false;
        }
        for (int i = 0; i < candidate.length(); i++) {
            if (candidate.charAt(i) != '`') {
                return false;
            }
        }
        return true;
    }

    private static String sanitizeLanguage(String language) {
        String clean = language.strip().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9+#._-]", "");
        return clean.length() > 24 ? "" : clean;
    }
}
