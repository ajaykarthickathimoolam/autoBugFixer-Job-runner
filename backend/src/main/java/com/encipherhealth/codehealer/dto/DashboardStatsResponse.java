package com.encipherhealth.codehealer.dto;

import java.util.List;

public record DashboardStatsResponse(
        long totalBugs,
        long fixedCount,
        long failedCount,
        long inProgressCount,
        List<DashboardBucket> buckets
) {
}
