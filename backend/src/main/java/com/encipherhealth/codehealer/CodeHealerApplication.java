package com.encipherhealth.codehealer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CodeHealerApplication {
    public static void main(String[] args) {
        SpringApplication.run(CodeHealerApplication.class, args);
    }
}
