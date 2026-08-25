package com.encipherhealth.codehealer.service.ticket;

import com.encipherhealth.codehealer.model.AgilePlatform;
import com.encipherhealth.codehealer.model.Project;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class TicketPlatformRegistry {

    private final Map<AgilePlatform, TicketPlatform> byPlatform = new EnumMap<>(AgilePlatform.class);

    public TicketPlatformRegistry(List<TicketPlatform> platforms) {
        for (TicketPlatform platform : platforms) {
            byPlatform.put(platform.platform(), platform);
        }
    }

    public TicketPlatform forProject(Project project) {
        AgilePlatform id = project.resolvedPlatform();
        TicketPlatform platform = byPlatform.get(id);
        if (platform == null) {
            throw new IllegalStateException("No ticket platform registered for " + id);
        }
        return platform;
    }
}
