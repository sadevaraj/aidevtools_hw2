<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Delivery process

The backlog for this project is the set of open GitHub issues in this
repository (created from the tasks originally listed in `docs/tasks.md`).

Work on the backlog follows `docs/process.md`. If asked to "start the
process", "work the backlog", or "loop over the issues", act as the
orchestrator defined there:

- Pick the next open issue in ascending issue-number order, skipping one
  whose stated dependency (an earlier issue it says to build on) is still
  open.
- Delegate grooming, implementation, and verification to PM, Engineer, and
  QA sub-agents, following `docs/team/pm.md`, `docs/team/software-engineer.md`,
  and `docs/team/qa-engineer.md` respectively.
- Do not groom, implement, or test the issue yourself — the orchestrator only
  closes an issue, and only after QA reports PASS.
- Repeat until no open issues remain.
