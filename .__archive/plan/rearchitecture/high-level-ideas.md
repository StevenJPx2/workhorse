# High-Level Ideas

Just a compilation of ideas that are swimming in my head.

- Workhorse is only the SDK that orchestrates the agents. It provides the framework for how the agents run and makes sure that they are controlled.

- Workhorse elevator pitch.

  > Controllable, automated agents.

- The TUI is not connected to Workhorse but will be its own project / implementation of Workhorse.

- We can have two TUIs: Moby and Jiratown.

- For user interaction, I want one question or axiom to be in your mind: what can you do if you aren't allowed to have a chat box to interact with an agent? Or at least the main way to communicate to the agent?

- Generative UIs are the answer.

## Workhorse

One level, config, services, workflow.

We need db definitions too.

- Worktrees will work with bare repos. the bare repo will live in the .git/ directory, while we have the worktrees as directories in the same folder. Clean separation.

## Moby

Single TUI, much like Opencode or Pi, but it uses Workhorse and its limitations underneath.

Salient features:

- Workflow creation - super duper user friendly, will also have an agentic loop to allow an agent to create the workflow for you.
  - We might need the `AgentService` here to be pliable enough or even services to be exposed to allow this kind of behavior.

- Opencode-esque UI: text box initial UI, then see how it runs.
- What if we had a tab where we could see the diff of work done, and then be able to highlight the changes and comment like on github?

## Jiratown

TUI which will look like a regular Jira TUI. The difference here is that you can select one/many to get multiple tickets and run them with isolated agents.

- It can also provide a chat box to have an agent filter the tickets for you to pick up, or you can have it pick up tickets from an epic etc.
