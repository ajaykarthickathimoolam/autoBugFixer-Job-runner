package com.encipherhealth.codehealer.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

@Document(collection = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {
    @Id
    private String id;
    private String username;
    private String passwordHash;
    /** Which of DASHBOARD/PROJECTS/ADMIN/GUIDE this user can access. Null (never set - a legacy
     * record from before per-page access existed) means full access, so existing accounts aren't
     * locked out; an explicitly empty list on a newly created user means no page access at all. */
    private List<String> pageAccess;
    /** Which project ids this user can see/manage on the Projects page. Null (legacy record, or a
     * user created before this existed) means every project; an explicitly empty list means none. */
    private List<String> allowedProjectIds;
    private Instant createdAt;
}
