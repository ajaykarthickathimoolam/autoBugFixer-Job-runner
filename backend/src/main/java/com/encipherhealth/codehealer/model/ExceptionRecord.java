package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "exceptions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExceptionRecord {
    @Id
    private String id;
    private String jobId;
    private String projectId;
    private String kind;
    private String message;
    /** OPEN or RESOLVED */
    @Builder.Default
    private String status = "OPEN";
    private Instant createdAt;
    private Instant resolvedAt;
    private String resolvedBy;
}
