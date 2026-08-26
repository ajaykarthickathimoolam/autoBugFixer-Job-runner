const TOOLCHAIN_PATTERNS = [
  /release version \d+ not supported/i,
  /fatal error compiling: error: release version/i,
  /invalid target release/i,
  /invalid source release/i,
  /javac: command not found/i,
  /mvn: (?:command )?not found/i,
  /JAVA_HOME (?:not found|is not (?:defined|set))/i,
  /No compiler is provided in this environment/i,
  /unsupported class file major version/i,
];

/** True when a non-zero build/test is the runner's JDK/Maven/tooling, not the agent's diff. */
export function isToolchainFailure(output) {
  return TOOLCHAIN_PATTERNS.some((re) => re.test(String(output || '')));
}
