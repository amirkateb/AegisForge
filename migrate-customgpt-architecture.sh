#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/AegisForge"

backup_file() {
  local file="$1"
  cp "$file" "${file}.backup.$(date +%s)"
}

echo "== AegisForge CustomGPT architecture migration =="

cd "$ROOT"


# -----------------------------
# 1. task-runner.ts
# -----------------------------

TASK_RUNNER="server/src/task-runner.ts"

backup_file "$TASK_RUNNER"

python3 <<'PY'
from pathlib import Path

p = Path("server/src/task-runner.ts")
s = p.read_text()

# remove planner import
s = s.replace(
'import { planTask, type PlanningModel } from "@aegisforge/controller";',
''
)

# remove PlanningModel constructor dependency
s = s.replace(
'''constructor(private readonly store: PlatformStore, private readonly hub: AgentHub, private readonly planner: PlanningModel) {}''',
'''constructor(
    private readonly store: PlatformStore,
    private readonly hub: AgentHub
  ) {}'''
)

old = '''const existingPlan = await this.store.loadTaskPlan(task.id);
    const plan = existingPlan ?? await planTask(this.planner, { goal: task.goal, profile, tools });'''

new = '''const plan = await this.store.loadTaskPlan(task.id);

    if (!plan) {
      throw new Error(
        "Task has no execution plan. CustomGPT must provide a plan before execution."
      );
    }'''

if old not in s:
    raise SystemExit("task-runner plan block not found")

s = s.replace(old, new)

p.write_text(s)

print("task-runner.ts updated")
PY



# -----------------------------
# 2. app.ts
# -----------------------------

APP="server/src/app.ts"

backup_file "$APP"

python3 <<'PY'
from pathlib import Path

p = Path("server/src/app.ts")
s = p.read_text()


old = '''const taskRunner = options.planningModel ? new TaskRunner(options.store, agentHub, options.planningModel) : null;'''

new = '''const taskRunner = new TaskRunner(
    options.store,
    agentHub
  );'''

if old not in s:
    raise SystemExit("taskRunner initialization not found")

s = s.replace(old,new)


old2 = '''if (!taskRunner) return;
    void taskRunner.run(taskId).catch(async (error) => {'''

new2 = '''void taskRunner.run(taskId).catch(async (error) => {'''

if old2 in s:
    s = s.replace(old2,new2)


p.write_text(s)

print("app.ts updated")
PY



# -----------------------------
# 3. index.ts
# -----------------------------

INDEX="server/src/index.ts"

backup_file "$INDEX"

python3 <<'PY'
from pathlib import Path

p = Path("server/src/index.ts")
s = p.read_text()


s = s.replace(
'import { OpenAIPlanningModel } from "@aegisforge/controller";\n',
''
)


start = s.find('  ...(config.OPENAI_API_KEY')
if start != -1:
    end = s.find('  }),', start)

    if end != -1:
        end += len('  }),')
        s = s[:start] + s[end:]

p.write_text(s)

print("index.ts updated")
PY



# -----------------------------
# 4. mcp.ts
# -----------------------------

MCP="server/src/integrations/mcp.ts"

backup_file "$MCP"

python3 <<'PY'
from pathlib import Path

p = Path("server/src/integrations/mcp.ts")
s = p.read_text()


# add schema import
s = s.replace(
'import { IdSchema, PermissionLevelSchema } from "@aegisforge/contracts";',
'import { IdSchema, PermissionLevelSchema, EngineeringPlanSchema } from "@aegisforge/contracts";'
)


# add plan field in zod validation
old = '''technologies: z.array(z.string().min(1).max(100)).max(30).default([]),'''

new = '''technologies: z.array(z.string().min(1).max(100)).max(30).default([]),
            plan: EngineeringPlanSchema.optional(),'''

if old not in s:
    raise SystemExit("MCP validation block not found")

s = s.replace(old,new)


# save plan after create
old = '''const result = await store.createTaskIdempotently(
            key,
            hash(requested),
            input,
          );
          if (result.type === "MISMATCH")'''

new = '''const result = await store.createTaskIdempotently(
            key,
            hash(requested),
            input,
          );

          if (result.type === "CREATED" && requested.plan) {
            await store.saveTaskPlan(
              result.task.id,
              requested.plan,
            );
          }

          if (result.type === "MISMATCH")'''

if old not in s:
    raise SystemExit("MCP createTask block not found")

s = s.replace(old,new)


p.write_text(s)

print("mcp.ts updated")
PY



echo
echo "Migration completed."
echo "Backups created next to modified files."
