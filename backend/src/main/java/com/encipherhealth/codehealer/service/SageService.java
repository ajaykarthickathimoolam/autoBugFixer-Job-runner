package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.KnowledgeDocument;
import com.encipherhealth.codehealer.model.SageCitation;
import com.encipherhealth.codehealer.repository.KnowledgeDocumentRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import com.encipherhealth.codehealer.security.ProjectAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SageService {

    private final KnowledgeDocumentRepository knowledgeDocumentRepository;
    private final PageAccessService pageAccessService;
    private final ProjectAccessService projectAccessService;

    public KnowledgeDocument ingest(String projectId, String title, String source, String content, String visibility) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        projectAccessService.requireAccess(projectId);
        Instant now = Instant.now();
        KnowledgeDocument doc = KnowledgeDocument.builder()
                .projectId(projectId)
                .title(title)
                .source(source == null || source.isBlank() ? "manual" : source.strip())
                .content(content)
                .version(1)
                .visibility(normalizeVisibility(visibility))
                .createdBy(currentUsername())
                .createdAt(now)
                .updatedAt(now)
                .build();
        return knowledgeDocumentRepository.save(doc);
    }

    public KnowledgeDocument update(String id, String title, String source, String content, String visibility) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        KnowledgeDocument doc = knowledgeDocumentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));
        projectAccessService.requireAccess(doc.getProjectId());
        if (title != null && !title.isBlank()) {
            doc.setTitle(title);
        }
        if (source != null && !source.isBlank()) {
            doc.setSource(source.strip());
        }
        if (content != null) {
            doc.setContent(content);
            doc.setVersion(doc.getVersion() + 1);
        }
        if (visibility != null && !visibility.isBlank()) {
            doc.setVisibility(normalizeVisibility(visibility));
        }
        doc.setUpdatedAt(Instant.now());
        return knowledgeDocumentRepository.save(doc);
    }

    public void delete(String id) {
        pageAccessService.requireAccess(PageAccessService.ADMIN);
        KnowledgeDocument doc = knowledgeDocumentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));
        projectAccessService.requireAccess(doc.getProjectId());
        knowledgeDocumentRepository.deleteById(id);
    }

    public List<KnowledgeDocument> listForProject(String projectId) {
        projectAccessService.requireAccess(projectId);
        boolean admin = hasAdmin();
        return knowledgeDocumentRepository.findByProjectIdOrderByUpdatedAtDesc(projectId).stream()
                .filter(d -> admin || !"ADMIN".equalsIgnoreCase(d.getVisibility()))
                .toList();
    }

    public List<SageCitation> retrieve(String projectId, String query, int limit) {
        if (projectId == null || query == null || query.isBlank()) {
            return List.of();
        }
        boolean admin = hasAdmin();
        List<String> terms = tokenize(query);
        if (terms.isEmpty()) {
            return List.of();
        }
        record Scored(KnowledgeDocument doc, int score) {}
        return knowledgeDocumentRepository.findByProjectIdOrderByUpdatedAtDesc(projectId).stream()
                .filter(d -> admin || !"ADMIN".equalsIgnoreCase(d.getVisibility()))
                .map(d -> new Scored(d, score(d, terms)))
                .filter(s -> s.score > 0)
                .sorted(Comparator.comparingInt(Scored::score).reversed())
                .limit(Math.max(1, Math.min(limit, 8)))
                .map(s -> SageCitation.builder()
                        .documentId(s.doc.getId())
                        .title(s.doc.getTitle())
                        .excerpt(excerpt(s.doc.getContent(), terms))
                        .version(s.doc.getVersion())
                        .build())
                .toList();
    }

    public String formatForPrompt(List<SageCitation> citations) {
        if (citations == null || citations.isEmpty()) {
            return "(no authorized knowledge excerpts matched this ticket)";
        }
        StringBuilder sb = new StringBuilder();
        for (SageCitation c : citations) {
            sb.append("- [").append(c.getTitle()).append(" v").append(c.getVersion()).append("] ")
                    .append(c.getExcerpt() == null ? "" : c.getExcerpt()).append('\n');
        }
        return sb.toString();
    }

    public List<KnowledgeDocument> all() {
        return knowledgeDocumentRepository.findAll();
    }

    public void replaceAll(List<KnowledgeDocument> documents) {
        knowledgeDocumentRepository.deleteAll();
        if (documents != null && !documents.isEmpty()) {
            knowledgeDocumentRepository.saveAll(documents);
        }
    }

    private int score(KnowledgeDocument doc, List<String> terms) {
        String hay = ((doc.getTitle() == null ? "" : doc.getTitle()) + " "
                + (doc.getSource() == null ? "" : doc.getSource()) + " "
                + (doc.getContent() == null ? "" : doc.getContent())).toLowerCase(Locale.ROOT);
        int score = 0;
        for (String term : terms) {
            if (hay.contains(term)) {
                score += hay.split(Pattern.quote(term), -1).length - 1;
                if (doc.getTitle() != null && doc.getTitle().toLowerCase(Locale.ROOT).contains(term)) {
                    score += 3;
                }
            }
        }
        return score;
    }

    private String excerpt(String content, List<String> terms) {
        if (content == null || content.isBlank()) {
            return "";
        }
        String lower = content.toLowerCase(Locale.ROOT);
        int idx = -1;
        for (String term : terms) {
            int found = lower.indexOf(term);
            if (found >= 0 && (idx < 0 || found < idx)) {
                idx = found;
            }
        }
        if (idx < 0) {
            idx = 0;
        }
        int start = Math.max(0, idx - 80);
        int end = Math.min(content.length(), idx + 220);
        String slice = content.substring(start, end).replaceAll("\\s+", " ").strip();
        if (start > 0) {
            slice = "…" + slice;
        }
        if (end < content.length()) {
            slice = slice + "…";
        }
        return slice;
    }

    private List<String> tokenize(String query) {
        Set<String> stop = Set.of("the", "and", "for", "with", "this", "that", "from", "have", "been");
        List<String> terms = new ArrayList<>();
        for (String raw : query.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (raw.length() >= 3 && !stop.contains(raw)) {
                terms.add(raw);
            }
        }
        return terms.stream().distinct().collect(Collectors.toList());
    }

    private String normalizeVisibility(String visibility) {
        if (visibility != null && visibility.strip().equalsIgnoreCase("ADMIN")) {
            return "ADMIN";
        }
        return "PROJECT";
    }

    private boolean hasAdmin() {
        try {
            pageAccessService.requireAccess(PageAccessService.ADMIN);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String currentUsername() {
        try {
            return SecurityContextHolder.getContext().getAuthentication().getName();
        } catch (Exception e) {
            return "system";
        }
    }
}
