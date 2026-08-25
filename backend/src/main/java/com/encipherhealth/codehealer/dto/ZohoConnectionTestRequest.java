package com.encipherhealth.codehealer.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ZohoConnectionTestRequest {
    @NotBlank
    private String clientId;
    @NotBlank
    private String clientSecret;
    /** The authorization code generated from the Self Client's "Generate Code" tab. */
    @NotBlank
    private String code;
}
