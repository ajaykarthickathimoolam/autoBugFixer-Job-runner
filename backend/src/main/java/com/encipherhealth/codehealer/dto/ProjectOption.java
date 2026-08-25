package com.encipherhealth.codehealer.dto;

/** Minimal project info for the User Management "which projects can this user see" picker -
 * intentionally not filtered by the caller's own project access, since an ADMIN-access user
 * needs to grant others access to any project regardless of their own Projects-page grants. */
public record ProjectOption(String id, String name) {
}
