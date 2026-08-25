package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.BoardBucketResponse;
import com.encipherhealth.codehealer.dto.BoardItemResponse;
import com.encipherhealth.codehealer.dto.BoardResponse;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.service.ZohoJObjUnfurler.UnfurledRecord;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * On-demand, read-only fetch of a project's full Zoho Sprints board (backlog + every sprint, with
 * every ticket) for the Board view - completely separate from {@link ZohoSprintsPollerService},
 * which only ingests new bug tickets into Jobs. Nothing here touches Job/Project.lastPolledAt.
 *
 * Sprint display name field is UNCONFIRMED - the poller has only ever read {@code sprint.id()},
 * never any other sprint property. Resolved here via a defensive fallback chain, with a one-time
 * sample log of the real property key set on first use so the fallback list can be corrected after
 * one live call (same pattern already used for item fields in {@link ZohoSprintsPollerService}).
 * Status/priority have no confirmed human-readable name source anywhere in this codebase's Zoho
 * research - only opaque numeric ids are carried through, see {@link BoardItemResponse}.
 */
@Service
@Slf4j
public class ZohoBoardService {

    private record ItemsBatch(List<UnfurledRecord> items, Map<String, String> userNames) {
    }

    private final ZohoOAuthTokenService tokenService;
    private final WebClient webClient;

    public ZohoBoardService(ZohoOAuthTokenService tokenService,
                             WebClient.Builder builder,
                             @Value("${app.zoho.api-base-url}") String apiBaseUrl) {
        this.tokenService = tokenService;
        this.webClient = builder.baseUrl(apiBaseUrl).build();
    }

    /** Lets access-token/credential failures propagate to the caller rather than rendering an
     * empty board - only individual Zoho HTTP calls (a bad sprint fetch, etc.) are swallowed. */
    public BoardResponse fetchBoard(Project project) {
        String teamId = project.getZohoTeamId();
        String projectId = project.getZohoProjectIdExternal();
        String accessToken = tokenService.getAccessToken(project);

        List<BoardBucketResponse> buckets = new ArrayList<>();

        String backlogId = fetchBacklogId(teamId, projectId, accessToken);
        if (backlogId != null) {
            ItemsBatch batch = fetchItems(teamId, projectId, backlogId, accessToken);
            buckets.add(new BoardBucketResponse(backlogId, "Backlog", true, toItemResponses(batch)));
        }

        List<UnfurledRecord> sprints = fetchSprints(teamId, projectId, accessToken);
        boolean loggedSample = false;
        for (UnfurledRecord sprint : sprints) {
            if (!loggedSample) {
                log.info("Sample Zoho Sprints sprint fields for project {}: {}", project.getId(), sprint.properties().keySet());
                loggedSample = true;
            }
            String name = ZohoJObjUnfurler.textOf(sprint.properties(), "sprintName", "name", "title");
            ItemsBatch batch = fetchItems(teamId, projectId, sprint.id(), accessToken);
            buckets.add(new BoardBucketResponse(sprint.id(), name != null ? name : sprint.id(), false, toItemResponses(batch)));
        }

        return new BoardResponse(project.getId(), project.getName(), buckets);
    }

    private List<BoardItemResponse> toItemResponses(ItemsBatch batch) {
        return batch.items().stream().map(item -> toItemResponse(item, batch.userNames())).toList();
    }

    private BoardItemResponse toItemResponse(UnfurledRecord item, Map<String, String> userNames) {
        Map<String, JsonNode> props = item.properties();
        String creatorId = ZohoJObjUnfurler.textOf(props, "createdBy");
        String ownerId = ZohoJObjUnfurler.textOf(props, "ownerId");

        return new BoardItemResponse(
                item.id(),
                ZohoJObjUnfurler.textOf(props, "itemName", "title", "name", "summary"),
                ZohoJObjUnfurler.textOf(props, "description", "desc"),
                ownerId != null ? userNames.getOrDefault(ownerId, ownerId) : null,
                creatorId != null ? userNames.getOrDefault(creatorId, creatorId) : null,
                ZohoJObjUnfurler.textOf(props, "startDate"),
                ZohoJObjUnfurler.textOf(props, "endDate"),
                ZohoJObjUnfurler.textOf(props, "createdTime", "addedTime"),
                parseInt(ZohoJObjUnfurler.textOf(props, "points")),
                ZohoJObjUnfurler.textOf(props, "statusId"),
                ZohoJObjUnfurler.textOf(props, "projPriorityId")
        );
    }

    private Integer parseInt(String text) {
        if (text == null) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String fetchBacklogId(String teamId, String projectId, String accessToken) {
        JsonNode response = get(path(teamId, projectId) + "/?action=getbacklog", accessToken);
        if (response == null) {
            return null;
        }
        JsonNode backlogId = response.get("backlogId");
        return backlogId != null && !backlogId.isNull() ? backlogId.asText() : null;
    }

    private List<UnfurledRecord> fetchSprints(String teamId, String projectId, String accessToken) {
        JsonNode response = get(path(teamId, projectId) + "/sprints/?action=data&type=[1,2,3,4]&index=1&range=200", accessToken);
        return response == null ? List.of() : ZohoJObjUnfurler.unfurl(response, "sprint_prop", "sprintIds", "sprintJObj");
    }

    private ItemsBatch fetchItems(String teamId, String projectId, String sprintOrBacklogId, String accessToken) {
        String itemsPath = path(teamId, projectId) + "/sprints/" + sprintOrBacklogId + "/item/?action=sprintitems&subitem=true&index=1&range=200";
        JsonNode response = get(itemsPath, accessToken);
        if (response == null) {
            return new ItemsBatch(List.of(), Map.of());
        }
        List<UnfurledRecord> items = ZohoJObjUnfurler.unfurl(response, "item_prop", "itemIds", "itemJObj");
        Map<String, String> userNames = new HashMap<>();
        JsonNode userDisplayName = response.path("userDisplayName");
        Iterator<Map.Entry<String, JsonNode>> fields = userDisplayName.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            userNames.put(field.getKey(), field.getValue().asText());
        }
        return new ItemsBatch(items, userNames);
    }

    private String path(String teamId, String projectId) {
        return "/team/" + teamId + "/projects/" + projectId;
    }

    private JsonNode get(String path, String accessToken) {
        try {
            return webClient.get()
                    .uri(path)
                    .header("Authorization", "Zoho-oauthtoken " + accessToken)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(30));
        } catch (Exception e) {
            log.error("Zoho Sprints board request to {} failed: {}", path, e.getMessage());
            return null;
        }
    }
}
