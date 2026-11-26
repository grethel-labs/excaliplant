---
name: excaliplant-ticket-workflow
description: Plan, review, delegate, and implement an existing excaliplant issue through a verified pull request.
---

# Ticket workflow

The coordinating agent owns the issue from intake through the requested delivery point. Use the current model for planning if it can handle the reasoning required, or choose a stronger available model. Use strong models for independent review and lighter models capable of carrying out the reviewed plan for implementation and PR preparation.

If model selection is unavailable, keep the reviewer independent using the available model. If delegation is unavailable, the coordinator performs each phase, including dedicated self-review passes and PR preparation. Report those review and model limitations at handoff.

## 1. Research and draft the plan

Read the issue, relevant comments, and linked code, issues, PRs, and documentation. Verify relevant external behavior and implementation options on the web, favoring primary sources for the affected versions. Cite each source next to the decision it supports, and flag gaps in access or evidence.

Reproduce the problem or inspect the closest public entry point or example. Locate the owning layer and read the relevant [development skill](../../../AGENTS.md#choose-a-development-skill), [guardrails](../../../docs/development/guardrails.md), and [review guidelines](../../../docs/development/guidelines.md).

Write a plan before editing. Include the intended behavior, testable acceptance criteria, scope, affected entry points and outputs, ordered changes and dependencies, and the checks that will verify each criterion. Use the scope the user authorized when comments or related issues propose extra work. Record assumptions, open questions, and delivery constraints. Scale the detail to the ticket and explain any choice that affects compatibility or changes the public behavior.

## 2. Review and refine the plan

Give a separate strong reviewer the issue, its relevant links, repository evidence, and the draft plan. Include the relevant text or a summary in any handoff where the recipient lacks access to the source. Ask for a read-only review that maps each proposed step to an acceptance criterion or repository requirement. Have the reviewer identify work to drop, missing requirements or evidence, ordering problems, and checks that could pass despite a regression.

Revise the plan based on the findings and record the decisions that change scope or implementation. If the revision changes the approach or acceptance criteria materially, send it back for another plan review. Start implementation when the plan covers the ticket and the blocking findings are resolved.

## 3. Set the goal and subgoals

Record one ticket objective and one or more subgoals in the working plan. Give every subgoal ordered steps, an owner and edit boundaries, prerequisites, a deliverable, and a concrete completion check. Track pending, active, and completed work and record the evidence at each handoff. Use session goal tools where authorized and supported. A working checklist can represent the subgoal hierarchy.

Create the issue branch from current `main` before edits. For a batch, respect the requested ticket order and finish each ticket to its requested delivery point before starting the next when the user asks for sequential delivery.

## 4. Delegate implementation

Assign each bounded subgoal to one or more lighter-model agents. Give each agent the issue context, its branch or workspace, owned files, approved steps, acceptance criteria, and validation commands. Ask agents to return the actual changes, commands run and their results, and anything still unresolved. Escalate work that exceeds the assigned model's capabilities with the evidence needed to resume it.

Run dependent work in order. Parallelize only independent subgoals with disjoint write scopes and integrate them on the issue branch. Keep external actions with the coordinating agent unless they are explicitly assigned and authorized.

## 5. Review the integrated change

Run the focused checks and the [local gate](../../../AGENTS.md#validate-and-open-a-pr). Give a strong, independent reviewer the issue, refined plan, exact integrated diff, and test results. Ask for a read-only review of acceptance criteria through the public entry points, regression coverage, side effects, and applicable repository contracts. Have the reviewer report blocking findings with file and line references, verification limits, and any optional follow-ups.

Return blocking findings to an implementer with a concrete completion check. Repeat the affected checks and review the revised integrated diff. Advance to publication when the current diff passes the applicable checks and review.

## 6. Prepare and publish the pull request

Use a lighter-model agent to prepare the PR from the reviewed diff and actual verification results. Pass along the issue reference, the intended release label, and any limitations that belong in the description. Ask it to open the PR if the user authorized publication and the agent can publish in that context. The coordinator can publish the reviewed draft otherwise when authorized. Follow the [PR skill](../excaliplant-pull-requests/SKILL.md) and the [release guide](../../../docs/releasing.md). Use `release:none` for a change requested without a release.

Track CI through completion if the user requests it or authorizes a merge. Diagnose any observed failures, send change-related failures through the implementation and review loop, and verify the updated head. Verify required checks before an authorized merge. Treat publication and merge as separate actions. At the requested delivery point, report the PR, its check status, and any open blockers, including pending checks when delivering an open PR.

## References

- Scale model capability to the task and evaluate lighter models against the same quality criteria. [OpenAI guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- Scope delegated work and keep parallel workers away from shared edits. [Codex subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- Give reviewers explicit criteria and feed actionable findings into another revision. [Anthropic guidance on orchestrator–worker and evaluator–optimizer workflows](https://www.anthropic.com/research/building-effective-agents)
- Check behavior, complexity, and the quality of tests in code review. [Google Engineering Practices](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
