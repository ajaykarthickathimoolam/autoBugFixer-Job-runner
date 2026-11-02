package com.encipherhealth.codehealer.model;

public enum JobStatus {
    RECEIVED,
    ANALYZING,
    CLONING,
    FIXING,
    VERIFYING,
    SCANNING,
    /** Claude flagged a clarifying question and is paused - see {@link Job#getPendingQuestion()}. */
    AWAITING_INPUT,
    /** Change plan or L1 draft is waiting on a human gate. */
    AWAITING_APPROVAL,
    /** Operator or kill-switch pause; may be resumed. */
    PAUSED,
    PR_CREATED,
    NOTIFIED,
    /** L1 draft posted and ticket closed from EAO's perspective. */
    CLOSED,
    /** L1 case returned to a human queue. */
    ESCALATED,
    CANCELLED,
    FAILED
}
