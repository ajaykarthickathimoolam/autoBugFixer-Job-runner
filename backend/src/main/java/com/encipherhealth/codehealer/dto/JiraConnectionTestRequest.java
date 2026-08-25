package com.encipherhealth.codehealer.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class JiraConnectionTestRequest {
    @NotBlank
    private String baseUrl;
    @NotBlank
    private String email;
    @NotBlank
    private String apiToken;
}
