package com.encipherhealth.codehealer.controller;

import com.encipherhealth.codehealer.service.BackupRestoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/recovery")
@RequiredArgsConstructor
public class RecoveryController {

    private final BackupRestoreService backupRestoreService;

    @GetMapping("/backup")
    public Map<String, Object> backup() {
        return backupRestoreService.exportBackup();
    }

    @PostMapping("/restore")
    public Map<String, Object> restore(@RequestBody Map<String, Object> payload) {
        return backupRestoreService.restore(payload);
    }

    @PostMapping("/drill")
    public Map<String, Object> drill() {
        return backupRestoreService.recoveryDrill();
    }
}
