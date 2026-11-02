const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g;

/** Removes credential material from text that may be stored, logged, or sent to a ticket system. */
export function redactSecrets(text) {
  return String(text ?? '')
      .replace(PRIVATE_KEY, '[redacted private key]')
      .replace(/x-access-token:[^@\s]+@/gi, 'x-access-token:***@')
      .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1***:***@')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***')
      .replace(/\bghp_[A-Za-z0-9]{16,}\b/g, 'ghp_***')
      .replace(/\bghs_[A-Za-z0-9]{16,}\b/g, 'ghs_***')
      .replace(/\bghu_[A-Za-z0-9]{16,}\b/g, 'ghu_***')
      .replace(/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, 'github_pat_***')
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted jwt]')
      .replace(/((?:api[_-]?key|secret|password|token)\s*[:=]\s*['"])[^'"]{8,}(['"])/gi, '$1[redacted]$2');
}
