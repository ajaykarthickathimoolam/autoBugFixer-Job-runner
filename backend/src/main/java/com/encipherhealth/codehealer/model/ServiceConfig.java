package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Embedded (not a top-level Mongo document) description of one service within a project.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ServiceConfig {
    private String id;
    private String name;
    private String repoUrl;
    private String baseBranch;
    private String architectureMd;
    private String buildCommand;
    private String testCommand;
}
