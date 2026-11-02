package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "traces")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TraceEvent {
    @Id
    private String id;
    private String jobId;
    private String projectId;
    /** POLICY, MODEL, TOOL, APPROVAL, EXCEPTION, OUTCOME, GUARD, RECOVERY */
    private String kind;
    private String actor;
    private String action;
    private String detail;
    private Instant timestamp;
}
