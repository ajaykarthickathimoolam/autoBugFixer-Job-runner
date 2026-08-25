package com.encipherhealth.codehealer.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ServiceConfigRequest {
    private String id;
    @NotBlank
    private String name;
    @NotBlank
    private String repoUrl;
    @NotBlank
    private String baseBranch;
    private String architectureMd;
    private String buildCommand;
    private String testCommand;
}
