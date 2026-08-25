package com.encipherhealth.codehealer.jira;

import com.encipherhealth.codehealer.dto.BoardBucketResponse;
import com.encipherhealth.codehealer.dto.BoardItemResponse;
import com.encipherhealth.codehealer.dto.BoardResponse;
import com.encipherhealth.codehealer.dto.JiraProjectSummary;
import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.service.EncryptionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Jira Cloud REST v3 client. Credentials come from the CodeHealer project (encrypted in Mongo),
 * not process-wide env vars. Search uses {@code POST /rest/api/3/search/jql}; JQL date literals
 * are formatted in the Jira account timezone (from {@code /myself}).
 */
@Component
@Slf4j
public class JiraCloudClient {

    public record Site(String baseUrl, String email, String apiToken) {
        public String normalizedBaseUrl() {
            String url = baseUrl == null ? "" : baseUrl.strip();
            while (url.endsWith("/")) {
                url = url.substring(0, url.length() - 1);
            }
            return url;
        }

        public String basicAuth() {
            String credential = email.strip() + ":" + apiToken.strip();
            return Base64.getEncoder().encodeToString(credential.getBytes(StandardCharsets.UTF_8));
        }

        public boolean isComplete() {
            return JiraText.notBlank(baseUrl) && JiraText.notBlank(email) && JiraText.notBlank(apiToken)
                    && normalizedBaseUrl().startsWith("https://");
        }
    }

    public record JiraComment(String authorEmail, String authorName, Instant created, String bodyMarkdown) {
    }

    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private static final int MAX_ATTEMPTS = 4;
    private static final DateTimeFormatter JQL_TIMESTAMP =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ROOT);
    private static final String ISSUE_FIELDS =
            "summary,description,labels,priority,issuetype,status,reporter,assignee,created,updated";
    private static final String QUESTION_MARKER = "CodeHealer needs clarification to continue fixing this ticket:";

    private final WebClient.Builder webClientBuilder;
    private final EncryptionService encryptionService;
    private final AdfFlattener adf;
    private final ObjectMapper mapper;
    private final Map<String, ZoneId> zoneCache = new ConcurrentHashMap<>();

    public JiraCloudClient(WebClient.Builder webClientBuilder,
                           EncryptionService encryptionService,
                           AdfFlattener adf,
                           ObjectMapper mapper) {
        this.webClientBuilder = webClientBuilder;
        this.encryptionService = encryptionService;
        this.adf = adf;
        this.mapper = mapper;
    }

    public Site siteFor(Project project) {
        String token = encryptionService.decrypt(project.getJiraApiTokenEncrypted());
        return new Site(project.getJiraBaseUrl(), project.getJiraEmail(), token);
    }

    public boolean isConfigured(Project project) {
        if (project.getJiraBaseUrl() == null || project.getJiraEmail() == null
                || project.getJiraProjectKey() == null || project.getJiraApiTokenEncrypted() == null) {
            return false;
        }
        if (project.getJiraBaseUrl().isBlank() || project.getJiraEmail().isBlank()
                || project.getJiraProjectKey().isBlank()) {
            return false;
        }
        return siteFor(project).isComplete();
    }

    public JsonNode myself(Site site) {
        return json(call(site, "myself", HttpMethod.GET, "/rest/api/3/myself", null));
    }

    public List<JiraProjectSummary> listProjects(Site site) {
        JsonNode body = json(call(site, "projects", HttpMethod.GET,
                "/rest/api/3/project/search?maxResults=100", null));
        List<JiraProjectSummary> out = new ArrayList<>();
        for (JsonNode project : body.path("values")) {
            String key = project.path("key").asText("");
            String name = project.path("name").asText("");
            if (!key.isBlank()) {
                out.add(new JiraProjectSummary(key, name.isBlank() ? key : name));
            }
        }
        return out;
    }

    public NormalizedTicket fetchTicket(Project project, String issueKey) {
        Site site = siteFor(project);
        String key = JiraText.requireIssueKey(issueKey);
        JsonNode issue = json(call(site, "fetch-issue " + key, HttpMethod.GET,
                "/rest/api/3/issue/" + key + "?fields=" + ISSUE_FIELDS, null));
        return toTicket(issue);
    }

    public List<NormalizedTicket> searchCreatedSince(Project project, Instant since) {
        Site site = siteFor(project);
        String jql = buildCreatedJql(project, since, accountZone(project, site));
        return searchTickets(site, jql);
    }

    public List<NormalizedTicket> searchAllInProject(Project project) {
        Site site = siteFor(project);
        String jql = buildScopeJql(project) + " ORDER BY created ASC";
        return searchTickets(site, jql);
    }

    public void comment(Project project, String issueKey, String renderedBody) {
        Site site = siteFor(project);
        String key = JiraText.requireIssueKey(issueKey);
        ObjectNode request = mapper.createObjectNode();
        request.set("body", AdfCommentBuilder.document(mapper, renderedBody));
        call(site, "comment " + key, HttpMethod.POST,
                "/rest/api/3/issue/" + key + "/comment", write(request));
    }

    public List<JiraComment> listComments(Project project, String issueKey) {
        Site site = siteFor(project);
        String key = JiraText.requireIssueKey(issueKey);
        List<JiraComment> out = new ArrayList<>();
        int startAt = 0;
        for (int page = 0; page < 10; page++) {
            JsonNode body = json(call(site, "comments " + key, HttpMethod.GET,
                    "/rest/api/3/issue/" + key + "/comment?startAt=" + startAt + "&maxResults=100&orderBy=created",
                    null));
            JsonNode comments = body.path("comments");
            if (!comments.isArray() || comments.isEmpty()) {
                break;
            }
            for (JsonNode comment : comments) {
                out.add(new JiraComment(
                        comment.path("author").path("emailAddress").asText(""),
                        comment.path("author").path("displayName").asText("unknown"),
                        JiraText.parseTimestamp(comment.path("created").asText("")),
                        adf.toMarkdown(comment.path("body"))));
            }
            startAt += comments.size();
            if (startAt >= body.path("total").asInt(startAt)) {
                break;
            }
        }
        return out;
    }

    public void linkPullRequest(Project project, String issueKey, String prUrl, String title) {
        Site site = siteFor(project);
        String key = JiraText.requireIssueKey(issueKey);
        String url = JiraText.singleLine(prUrl);
        if (url.isBlank()) {
            return;
        }
        ObjectNode request = mapper.createObjectNode();
        request.put("globalId", JiraText.cap("codehealer-pr=" + url, 255));
        request.put("relationship", "is fixed by");
        ObjectNode application = request.putObject("application");
        application.put("type", "com.encipherhealth.codehealer");
        application.put("name", "CodeHealer");
        ObjectNode object = request.putObject("object");
        object.put("url", url);
        object.put("title", JiraText.cap(JiraText.singleLine(title), 250));
        object.put("summary", "Pull request proposed by CodeHealer — requires human review");
        call(site, "remote-link " + key, HttpMethod.POST,
                "/rest/api/3/issue/" + key + "/remotelink", write(request));
    }

    public BoardResponse fetchBoard(Project project) {
        Site site = siteFor(project);
        String jql = buildScopeJql(project) + " ORDER BY status ASC";
        JsonNode body = searchRaw(site, jql, "summary,description,status,assignee,reporter,created,priority");
        Map<String, List<BoardItemResponse>> byStatus = new LinkedHashMap<>();
        for (JsonNode issue : body.path("issues")) {
            JsonNode fields = issue.path("fields");
            String status = fields.path("status").path("name").asText("Unknown");
            BoardItemResponse item = new BoardItemResponse(
                    issue.path("key").asText(""),
                    fields.path("summary").asText(""),
                    adf.toMarkdown(fields.path("description")),
                    displayName(fields.path("assignee")),
                    displayName(fields.path("reporter")),
                    null,
                    null,
                    fields.path("created").asText(null),
                    null,
                    status,
                    fields.path("priority").path("name").asText(null));
            byStatus.computeIfAbsent(status, s -> new ArrayList<>()).add(item);
        }
        List<BoardBucketResponse> buckets = new ArrayList<>();
        byStatus.forEach((name, items) ->
                buckets.add(new BoardBucketResponse(name, name, "Backlog".equalsIgnoreCase(name), items)));
        return new BoardResponse(project.getId(), project.getName(), buckets);
    }

    public String questionMarker() {
        return QUESTION_MARKER;
    }

    private List<NormalizedTicket> searchTickets(Site site, String jql) {
        JsonNode body = searchRaw(site, jql, ISSUE_FIELDS);
        List<NormalizedTicket> tickets = new ArrayList<>();
        for (JsonNode issue : body.path("issues")) {
            tickets.add(toTicket(issue));
        }
        return tickets;
    }

    private JsonNode searchRaw(Site site, String jql, String fields) {
        ObjectNode request = mapper.createObjectNode();
        request.put("jql", jql);
        request.put("maxResults", 100);
        var fieldArray = request.putArray("fields");
        for (String field : fields.split(",")) {
            fieldArray.add(field.strip());
        }
        log.debug("Jira search JQL: {}", jql);
        return json(call(site, "search", HttpMethod.POST, "/rest/api/3/search/jql", write(request)));
    }

    private NormalizedTicket toTicket(JsonNode issue) {
        JsonNode fields = issue.path("fields");
        String description = adf.toMarkdown(fields.path("description"));
        List<String> codeBlocks = adf.codeBlocks(fields.path("description"));
        if (!codeBlocks.isEmpty() && (description == null || !description.contains("```"))) {
            StringBuilder sb = new StringBuilder(description == null ? "" : description);
            for (String block : codeBlocks) {
                if (!sb.isEmpty()) {
                    sb.append("\n\n");
                }
                sb.append("```\n").append(block).append("\n```");
            }
            description = sb.toString();
        }
        return new NormalizedTicket(
                issue.path("key").asText(""),
                fields.path("summary").asText(""),
                description,
                displayName(fields.path("reporter")),
                displayName(fields.path("assignee")),
                null);
    }

    private static String displayName(JsonNode user) {
        String name = user.path("displayName").asText("");
        return name.isBlank() ? null : name;
    }

    String buildCreatedJql(Project project, Instant since, ZoneId zone) {
        StringBuilder jql = new StringBuilder(buildScopeJql(project));
        if (since != null) {
            jql.append(" AND created >= \"")
                    .append(JQL_TIMESTAMP.format(since.atZone(zone)))
                    .append('"');
        }
        jql.append(" ORDER BY created ASC");
        return jql.toString();
    }

    private String buildScopeJql(Project project) {
        String key = JiraText.singleLine(project.getJiraProjectKey()).replace("\"", "\\\"");
        StringBuilder jql = new StringBuilder("project = \"").append(key).append('"');
        String typesCsv = project.getJiraIssueTypes();
        if (typesCsv == null || typesCsv.isBlank()) {
            typesCsv = "Bug";
        }
        List<String> types = new ArrayList<>();
        for (String part : typesCsv.split(",")) {
            String trimmed = part.strip();
            if (!trimmed.isEmpty()) {
                types.add('"' + trimmed.replace("\"", "\\\"") + '"');
            }
        }
        if (!types.isEmpty()) {
            jql.append(" AND issuetype in (").append(String.join(", ", types)).append(')');
        }
        return jql.toString();
    }

    private ZoneId accountZone(Project project, Site site) {
        return zoneCache.computeIfAbsent(project.getId(), id -> {
            try {
                JsonNode me = myself(site);
                String zone = me.path("timeZone").asText("");
                if (JiraText.notBlank(zone)) {
                    ZoneId resolved = ZoneId.of(zone.strip());
                    log.info("Jira account timezone for project {} resolved to {}", project.getId(), resolved);
                    return resolved;
                }
            } catch (RuntimeException e) {
                log.warn("Could not read Jira account timezone for project {}: {}", project.getId(), e.toString());
            }
            return ZoneOffset.UTC;
        });
    }

    private String write(JsonNode node) {
        try {
            return mapper.writeValueAsString(node);
        } catch (Exception e) {
            throw new JiraApiException("Failed to serialize Jira request: " + e.getMessage(), 0, false, e);
        }
    }

    private JsonNode json(String body) {
        if (body == null || body.isBlank()) {
            return mapper.createObjectNode();
        }
        try {
            return mapper.readTree(body);
        } catch (Exception e) {
            throw new JiraApiException("Jira returned non-JSON: " + JiraText.abbreviate(body, 200), 0, false, e);
        }
    }

    private String call(Site site, String operation, HttpMethod method, String path, String jsonBody) {
        if (site == null || !site.isComplete()) {
            throw new JiraApiException("Jira is not configured; cannot " + operation, 0, false);
        }
        WebClient client = webClientBuilder.clone()
                .baseUrl(site.normalizedBaseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Basic " + site.basicAuth())
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.USER_AGENT, "codehealer")
                .build();

        JiraApiException last = null;
        long backoffMs = 1_000L;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                WebClient.RequestHeadersSpec<?> request = jsonBody == null
                        ? client.method(method).uri(path)
                        : client.method(method).uri(path)
                                .contentType(MediaType.APPLICATION_JSON)
                                .bodyValue(jsonBody);
                String body = request.exchangeToMono(res -> res.bodyToMono(String.class).defaultIfEmpty("").map(payload -> {
                            int status = res.statusCode().value();
                            if (status >= 400) {
                                boolean retryable = status == 429 || status >= 500;
                                throw new JiraApiException(operation + " failed with HTTP " + status + ": "
                                        + JiraText.abbreviate(payload, 400), status, retryable);
                            }
                            return payload;
                        }))
                        .block(TIMEOUT);
                return body;
            } catch (JiraApiException e) {
                last = e;
                if (!e.isRetryable() || attempt == MAX_ATTEMPTS) {
                    throw e;
                }
            } catch (RuntimeException e) {
                last = new JiraApiException(operation + " failed in transport: " + e.getMessage(), 0, true, e);
                if (attempt == MAX_ATTEMPTS) {
                    throw last;
                }
            }
            log.warn("Jira {} attempt {}/{} failed; retrying in {} ms", operation, attempt, MAX_ATTEMPTS, backoffMs);
            sleep(backoffMs);
            backoffMs = Math.min(30_000L, backoffMs * 2);
        }
        throw last;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new JiraApiException("interrupted while backing off a Jira retry", 0, false, e);
        }
    }
}
