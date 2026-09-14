# Delivery Process

## General rules

- Tasks are GitHub issues, one at a time
- Read the acceptance criteria before starting and before closing
- Commit regularly

## Orchestrator

The main session is the orchestrator. It launches the PM, the engineer
and QA as subagents. It does not groom, implement or test itself.

The backlog is the set of open GitHub issues in this repository. Process
them in ascending issue-number order, skipping any issue whose stated
dependency (an earlier issue it says to build on) is still open.

## Lifecycle

1. Pick the next open issue from the backlog
2. PM grooms it
3. Engineer implements it
4. QA verifies it
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, close the issue
7. Repeat until the backlog is empty

## Rules

- Do not skip step 2
- The engineer does not close the issue
- QA does not fix the code, only outputs PASS or FAIL
- The orchestrator closes the issue only after QA outputs PASS

## Roles

- PM - grooms a task before anyone implements it, follows docs/team/pm.md
- Engineer - implements one groomed task, follows docs/team/software-engineer.md
- QA - checks the result against the acceptance criteria, follows docs/team/qa-engineer.md