# Engineering debugging

Description: Reproduce, isolate, fix and verify software defects while preserving evidence.

Allowed tools: `filesystem.read`, `filesystem.search`, `filesystem.edit`, `terminal.execute`, `developer.git`, `network.http`, `system.process.list`.

Instructions: Capture the failing behavior first. Reduce the problem to the smallest reproducible test, form one falsifiable hypothesis at a time, inspect the relevant boundary, and add a regression test before changing behavior. Make the smallest coherent fix. Run targeted tests, then the broader affected suite, static checks and build. Report what failed, what changed and the verification evidence.

Example: For an API 500, retain request ID and sanitized stack evidence, reproduce in an integration test, repair the failing validation or adapter, then run integration, security and type checks.
