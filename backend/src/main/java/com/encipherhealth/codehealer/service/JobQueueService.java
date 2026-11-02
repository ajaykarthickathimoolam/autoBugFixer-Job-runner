package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.Project;
import com.encipherhealth.codehealer.model.Settings;
import com.encipherhealth.codehealer.repository.SettingsRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Ensures only one active job per service at a time (locks acquired in sorted service-id order to
 * avoid deadlocks between jobs touching overlapping service sets), bounded overall by a
 * global max-concurrent-jobs cap that the admin can change at runtime.
 */
@Service
@Slf4j
public class JobQueueService {

    private final JobOrchestrationService orchestrationService;
    private final ExecutorService executor;
    private final Map<String, ReentrantLock> serviceLocks = new ConcurrentHashMap<>();

    private final Object globalGate = new Object();
    private volatile int maxConcurrentJobs;
    private int activeJobs = 0;

    public JobQueueService(JobOrchestrationService orchestrationService,
                            ExecutorService executor,
                            SettingsRepository settingsRepository) {
        this.orchestrationService = orchestrationService;
        this.executor = executor;
        this.maxConcurrentJobs = settingsRepository.findById("global")
                .map(Settings::getMaxConcurrentJobs)
                .filter(m -> m > 0)
                .orElse(5);
    }

    public void setMaxConcurrentJobs(int max) {
        synchronized (globalGate) {
            this.maxConcurrentJobs = max;
            globalGate.notifyAll();
        }
    }

    public void submit(Job job, Project project) {
        executor.submit(() -> process(job, project));
    }

    private void process(Job job, Project project) {
        List<ReentrantLock> locks = job.getServiceIds().stream()
                .sorted()
                .map(id -> serviceLocks.computeIfAbsent(id, k -> new ReentrantLock()))
                .toList();
        locks.forEach(ReentrantLock::lock);
        try {
            acquireGlobalSlot();
            try {
                orchestrationService.run(job, project);
            } finally {
                releaseGlobalSlot();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while waiting for a global job slot for job {}", job.getId());
        } finally {
            for (int i = locks.size() - 1; i >= 0; i--) {
                locks.get(i).unlock();
            }
        }
    }

    private void acquireGlobalSlot() throws InterruptedException {
        synchronized (globalGate) {
            while (activeJobs >= maxConcurrentJobs) {
                globalGate.wait();
            }
            activeJobs++;
        }
    }

    private void releaseGlobalSlot() {
        synchronized (globalGate) {
            activeJobs--;
            globalGate.notifyAll();
        }
    }

    public int getActiveJobs() {
        synchronized (globalGate) {
            return activeJobs;
        }
    }

    public int getMaxConcurrentJobs() {
        return maxConcurrentJobs;
    }
}
