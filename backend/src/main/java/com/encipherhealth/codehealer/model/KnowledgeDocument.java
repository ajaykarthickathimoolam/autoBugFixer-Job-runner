package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "knowledge")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeDocument {
    @Id
    private String id;
    private String projectId;
    private String title;
    /** Origin label, e.g. runbook, policy, FAQ. */
    private String source;
    private String content;
    @Builder.Default
    private int version = 1;
    /** PROJECT (anyone with project access) or ADMIN. */
    @Builder.Default
    private String visibility = "PROJECT";
    private String createdBy;
    private Instant createdAt;
    private Instant updatedAt;
}
