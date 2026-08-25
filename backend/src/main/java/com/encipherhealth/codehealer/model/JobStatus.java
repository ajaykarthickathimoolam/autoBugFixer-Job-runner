package com.encipherhealth.codehealer.model;

public enum JobStatus {
    RECEIVED,
    ANALYZING,
    CLONING,
    FIXING,
    VERIFYING,
    /** Claude flagged a clarifying question and is paused - see {@link Job#getPendingQuestion()}. */
    AWAITING_INPUT,
    PR_CREATED,
    NOTIFIED,
    FAILED
}
