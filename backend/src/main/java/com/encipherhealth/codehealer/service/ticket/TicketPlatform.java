package com.encipherhealth.codehealer.service.ticket;

import com.encipherhealth.codehealer.dto.BoardResponse;
import com.encipherhealth.codehealer.dto.NormalizedTicket;
import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.Job;
import com.encipherhealth.codehealer.model.Project;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * One adapter per agile host (Zoho Sprints, Jira Cloud). Orchestration and the job-runner
 * never mention a vendor — they only see {@link NormalizedTicket} and job status.
 */
public interface TicketPlatform {

    AgilePlatform platform();

    boolean isConfigured(Project project);

    /**
     * Tickets created after {@code cursor}. A null cursor means first poll: record a baseline
     * and return an empty list so existing board items do not become jobs.
     */
    List<NormalizedTicket> discoverNewTickets(Project project, Instant cursor);

    BoardResponse fetchBoard(Project project);

    void postQuestion(Project project, Job job, String question);

    Optional<String> findReplyAfter(Project project, Job job, Instant since);

    /** Optional write-back (Jira comment + remote link). Zoho is a no-op; Cliq still runs separately. */
    default void notifyPrCreated(Project project, Job job) {
    }

    default void notifyFailure(Project project, Job job) {
    }

    /** Fetch one ticket by id for webhook doorbells. Empty if the key is not in this project's scope. */
    default Optional<NormalizedTicket> fetchTicket(Project project, String ticketId) {
        return Optional.empty();
    }
}
