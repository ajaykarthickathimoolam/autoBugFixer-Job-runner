package com.encipherhealth.codehealer.jira;

public class JiraApiException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final int status;
    private final boolean retryable;

    public JiraApiException(String message, int status, boolean retryable) {
        super(message);
        this.status = status;
        this.retryable = retryable;
    }

    public JiraApiException(String message, int status, boolean retryable, Throwable cause) {
        super(message, cause);
        this.status = status;
        this.retryable = retryable;
    }

    public int getStatus() {
        return status;
    }

    public boolean isRetryable() {
        return retryable;
    }
}
