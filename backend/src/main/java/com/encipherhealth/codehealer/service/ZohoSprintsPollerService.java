package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.service.ZohoJObjUnfurler.UnfurledRecord;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Zoho Sprints item discovery for {@link com.encipherhealth.codehealer.service.ticket.ZohoTicketPlatform}.
 * Scheduling lives in {@link com.encipherhealth.codehealer.service.ticket.TicketPollerService}.
 */
@Service
@Slf4j
public class ZohoSprintsPollerService {

    private record ItemsBatch(List<UnfurledRecord> items, Map<String, String> userNames) {
    }

    private record ItemEntry(UnfurledRecord item, String containerId) {
    }

    private final ZohoOAuthTokenService tokenService;
    private final WebClient webClient;

    public ZohoSprintsPollerService(ZohoOAuthTokenService tokenService,
                                     WebClient.Builder builder,
                                     @Value("${app.zoho.api-base-url}") String apiBaseUrl) {
        this.tokenService = tokenService;
        this.webClient = builder.baseUrl(apiBaseUrl).build();
    }

    public List<NormalizedTicket> discoverNewTickets(Project project, Instant cursor) {
        String teamId = project.getZohoTeamId();
        String projectId = project.getZohoProjectIdExternal();
        if (teamId == null || projectId == null) {
            log.warn("Project {} is missing zohoTeamId/zohoProjectIdExternal - skipping", project.getId());
            return List.of();
        }

        String accessToken = tokenService.getAccessToken(project);
        List<ItemEntry> entries = new ArrayList<>();
        Map<String, String> names = new HashMap<>();

        String backlogId = fetchBacklogId(teamId, projectId, accessToken);
        if (backlogId != null) {
            ItemsBatch batch = fetchItems(teamId, projectId, backlogId, accessToken);
            batch.items().forEach(item -> entries.add(new ItemEntry(item, backlogId)));
            names.putAll(batch.userNames());
        }
        for (UnfurledRecord sprint : fetchSprints(teamId, projectId, accessToken)) {
            ItemsBatch batch = fetchItems(teamId, projectId, sprint.id(), accessToken);
            batch.items().forEach(item -> entries.add(new ItemEntry(item, sprint.id())));
            names.putAll(batch.userNames());
        }

        if (cursor == null) {
            log.info("First poll for Zoho project {} - recording {} existing item(s) as baseline, no jobs created",
                    project.getId(), entries.size());
            return List.of();
        }

        boolean loggedSample = false;
        List<NormalizedTicket> tickets = new ArrayList<>();
        for (ItemEntry entry : entries) {
            UnfurledRecord item = entry.item();
            if (!loggedSample) {
                log.info("Sample Zoho Sprints item fields for project {}: {}", project.getId(), item.properties().keySet());
                loggedSample = true;
            }
            Instant createdTime = parseInstant(ZohoJObjUnfurler.textOf(item.properties(), "createdTime", "addedTime", "startDate"));
            if (createdTime == null || !createdTime.isAfter(cursor)) {
                continue;
            }
            String creatorId = ZohoJObjUnfurler.textOf(item.properties(), "createdBy");
            String ownerId = ZohoJObjUnfurler.textOf(item.properties(), "ownerId");
            tickets.add(new NormalizedTicket(
                    item.id(),
                    ZohoJObjUnfurler.textOf(item.properties(), "itemName", "title", "name", "summary"),
                    ZohoJObjUnfurler.textOf(item.properties(), "description", "desc"),
                    creatorId != null ? names.getOrDefault(creatorId, creatorId) : null,
                    ownerId != null ? names.getOrDefault(ownerId, ownerId) : null,
                    entry.containerId()));
        }
        return tickets;
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
            log.error("Zoho Sprints request to {} failed: {}", path, e.getMessage());
            return null;
        }
    }
}
