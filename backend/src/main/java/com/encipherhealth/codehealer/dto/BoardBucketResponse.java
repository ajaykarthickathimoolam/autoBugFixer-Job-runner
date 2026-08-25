package com.encipherhealth.codehealer.dto;

import java.util.List;

/** One bucket on the board - the backlog, or a single sprint - with its tickets. */
public record BoardBucketResponse(String id, String name, boolean isBacklog, List<BoardItemResponse> items) {
}
