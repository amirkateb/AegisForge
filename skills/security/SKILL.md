# Security review

Description: Review identity, input, dependency, secret, network and execution boundaries before engineering changes.

Allowed tools: `filesystem.read`, `filesystem.search`, `terminal.execute`, `developer.git`, `network.dns`, `network.http`, `network.port`.

Instructions: Start with assets and trust boundaries. Trace untrusted input to filesystem, process, database and network sinks. Validate authentication before authorization and assignment before execution. Search for secrets without printing values. Prefer reproducible evidence and classify impact/exploitability separately. Do not run exploit payloads against production or change security state without explicit approval.

Example: For a command-injection report, identify the input contract, confirm whether an interpolated shell exists, prove reachability with a harmless test, propose argument-array execution and add a regression test.
