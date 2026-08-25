package com.encipherhealth.codehealer.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class CreateUserRequest {
    @NotBlank
    private String username;
    @NotBlank
    private String password;
    /** Which pages this user can access - DASHBOARD/PROJECTS/ADMIN/GUIDE. Omit/empty for none. */
    private List<String> pageAccess;
    /** Which project ids this user can see/manage. Omit/empty for none. */
    private List<String> allowedProjectIds;
}
