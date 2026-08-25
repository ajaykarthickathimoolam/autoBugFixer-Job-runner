package com.encipherhealth.codehealer.dto;

import lombok.Data;

import java.util.List;

@Data
public class UpdateAccessRequest {
    /** Which pages this user can access - DASHBOARD/PROJECTS/ADMIN/GUIDE. Empty means none. */
    private List<String> pageAccess;
    /** Which project ids this user can see/manage. Empty means none. */
    private List<String> allowedProjectIds;
}
