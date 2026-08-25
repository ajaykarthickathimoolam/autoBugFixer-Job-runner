package com.encipherhealth.codehealer.service;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Lets {@link JobOrchestrationService} block on the terminal (NOTIFIED/FAILED) event that the
 * job-runner reports back for a job, so the per-service lock in {@link JobQueueService} is held
 * for the job's whole lifetime rather than just the initial dispatch call.
 */
@Component
public class JobCompletionRegistry {

    private final Map<String, CompletableFuture<Void>> futures = new ConcurrentHashMap<>();

    public void register(String jobId) {
        futures.put(jobId, new CompletableFuture<>());
    }

    public void complete(String jobId) {
        CompletableFuture<Void> f = futures.get(jobId);
        if (f != null) {
            f.complete(null);
        }
    }

    /** @return true if the job completed before the timeout elapsed. */
    public boolean awaitCompletion(String jobId, Duration timeout) {
        CompletableFuture<Void> f = futures.get(jobId);
        if (f == null) {
            return true;
        }
        try {
            f.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            return true;
        } catch (TimeoutException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (ExecutionException e) {
            return true;
        } finally {
            futures.remove(jobId);
        }
    }
}
