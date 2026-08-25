package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.service.ZohoJObjUnfurler.UnfurledRecord;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Posts a clarifying question onto a Zoho Sprints item as a comment, and checks for a human's
 * reply on it. Both directions are confirmed working end to end against a live ticket (2026-08-22):
 * posting via {@code POST .../modules/{moduleId}/entity/{itemId}/notes/?action=addnotes} once the
 * Zoho connection's OAuth scope includes {@code ZohoSprints.comments.READ/CREATE/UPDATE/DELETE},
 * and reading replies via {@code GET .../item/{id}/activity/}, matching entries of the form
 * {@code A comment <content> <span class="...">has been added</span>} so only real comments count
 * as a reply (not other ticket activity like status changes that appear in the same feed).
 * {@code ITEMS_MODULE_ID} was observed as a fixed value for this Zoho org/project; if a future
 * project's comments fail to post, this may need to vary per-project rather than being a constant.
 */
@Service
@Slf4j
public class ZohoCommentsService {

    /** Observed live for this org/project - see class javadoc; may need to be per-project if this doesn't generalize. */
    private static final String ITEMS_MODULE_ID = "32715000000002031";

    /** Matches the confirmed real "display" text Zoho uses for a comment being added; see class javadoc. */
    private static final Pattern COMMENT_ADDED_PATTERN =
            Pattern.compile("^A comment\\s+(.*?)\\s*<span[^>]*>has been added</span>$", Pattern.DOTALL);

    private final WebClient webClient;

    public ZohoCommentsService(WebClient.Builder builder,
                                @Value("${app.zoho.api-base-url}") String apiBaseUrl) {
        this.webClient = builder.baseUrl(apiBaseUrl).build();
    }

    public void postQuestion(String teamId, String projectId, String containerId, String itemId,
                              String accessToken, String question) {
        String path = "/team/" + teamId + "/projects/" + projectId
                + "/modules/" + ITEMS_MODULE_ID + "/entity/" + itemId + "/notes/?action=addnotes";
        String noteHtml = "<div>CodeHealer needs clarification to continue fixing this ticket: "
                + escapeHtml(question) + "</div>";

        MultipartBodyBuilder form = new MultipartBodyBuilder();
        form.part("name", noteHtml);

        // InternalJobEventController wraps this call and logs/reports failures itself.
        webClient.post()
                .uri(path)
                .header("Authorization", "Zoho-oauthtoken " + accessToken)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(form.build()))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block(Duration.ofSeconds(30));
    }

    private String escapeHtml(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Best-effort: returns the first activity entry timestamped after {@code since}, if any. */
    public Optional<String> findReplyAfter(String teamId, String projectId, String containerId, String itemId,
                                            String accessToken, Instant since) {
        String path = itemPath(teamId, projectId, containerId, itemId) + "/activity/?index=1&range=50";
        JsonNode response;
        try {
            response = webClient.get()
                    .uri(path)
                    .header("Authorization", "Zoho-oauthtoken " + accessToken)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(30));
        } catch (Exception e) {
            log.warn("Failed to check Zoho item {} activity for a reply: {}", itemId, e.getMessage());
            return Optional.empty();
        }
        if (response == null) {
            return Optional.empty();
        }

        List<UnfurledRecord> entries = unfurlAuditFeed(response);
        for (UnfurledRecord entry : entries) {
            Instant entryTime = parseInstant(ZohoJObjUnfurler.textOf(entry.properties(), "actiontime"));
            if (entryTime == null || !entryTime.isAfter(since)) {
                continue;
            }
            String actionBy = ZohoJObjUnfurler.textOf(entry.properties(), "actionby");
            if (actionBy == null || actionBy.isBlank()) {
                continue;
            }
            String display = ZohoJObjUnfurler.textOf(entry.properties(), "display");
            String commentText = extractCommentText(display);
            if (commentText != null && !commentText.isBlank()) {
                return Optional.of(commentText);
            }
        }
        return Optional.empty();
    }

    private String extractCommentText(String display) {
        if (display == null) {
            return null;
        }
        Matcher matcher = COMMENT_ADDED_PATTERN.matcher(display.trim());
        if (!matcher.matches()) {
            return null;
        }
        return matcher.group(1).replaceAll("<[^>]+>", "").trim();
    }

    /** {@code auditJObj} groups entries by date; flatten every date's entries into one list. */
    private List<UnfurledRecord> unfurlAuditFeed(JsonNode response) {
        List<UnfurledRecord> all = new ArrayList<>();
        JsonNode propNode = response.path("audit_prop");
        JsonNode auditJObj = response.path("auditJObj");
        Iterator<Map.Entry<String, JsonNode>> dateFields = auditJObj.fields();
        while (dateFields.hasNext()) {
            JsonNode dateEntry = dateFields.next().getValue();
            all.addAll(ZohoJObjUnfurler.unfurl(propNode, dateEntry.path("auditIds"), dateEntry.path("auditObj")));
        }
        return all;
    }

    private String itemPath(String teamId, String projectId, String containerId, String itemId) {
        return "/team/" + teamId + "/projects/" + projectId + "/sprints/" + containerId + "/item/" + itemId;
    }

    private Instant parseInstant(String text) {
        if (text == null) {
            return null;
        }
        try {
            return Instant.parse(text);
        } catch (Exception e) {
            return null;
        }
    }
}
