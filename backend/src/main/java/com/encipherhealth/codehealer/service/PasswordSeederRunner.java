package com.encipherhealth.codehealer.service;

import com.encipherhealth.codehealer.model.User;
import com.encipherhealth.codehealer.repository.UserRepository;
import com.encipherhealth.codehealer.security.PageAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
@RequiredArgsConstructor
@Slf4j
public class PasswordSeederRunner implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.seed.admin-username}")
    private String adminUsername;
    @Value("${app.seed.admin-password}")
    private String adminPassword;

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.count() == 0) {
            User user = User.builder()
                    .username(adminUsername)
                    .passwordHash(passwordEncoder.encode(adminPassword))
                    .pageAccess(PageAccessService.ALL_PAGES)
                    .createdAt(Instant.now())
                    .build();
            userRepository.save(user);
            log.info("Seeded initial admin user '{}'", adminUsername);
        }
    }
}
