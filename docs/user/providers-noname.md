# NoName

F4code can run NoName, an agent harness that serves its own chat page and runs its own tools, model providers, approvals and checks. F4code drives the NoName server that runs on the same machine as the F4code server, so the files it changes are the project's files.

## Set up NoName

1. Start NoName on the machine that runs the F4code server (`./start.sh` in its folder). For a machine you added over SSH, that is the remote machine.
2. Restart F4code, or the machine's F4code server. It switches NoName on when the server answers, unless you turned NoName off there. Otherwise, enable NoName in **Settings → Providers** for that machine.
3. If NoName does not listen on port 8890 of that machine, set **Server URL**, such as `http://127.0.0.1:9000`.

The provider shows an error until the server answers.

## Models

The model picker lists **NoName default** first. It runs the model NoName would choose itself: the one its last turn in that conversation used, or its default. The other entries are every model of each provider switched on in NoName's **Settings → Providers**, named with the provider they run on. Add or change model providers in NoName; F4code reads them each time it refreshes the provider.

## Approvals and questions

NoName asks before it writes files or runs commands, and F4code shows those requests as approvals. **Allow** lets that one call run. F4code does not offer NoName's **Always allow**, because NoName keeps it with its conversation after the thread ends. In **Full access**, F4code allows each call itself.

When NoName's agent asks a question with choices, it appears above the composer, and your answer goes back to the agent.

**Stop** ends the turn in NoName as well, and the thread waits until NoName confirms.

## Conversations

Each thread is one NoName conversation in agent mode, working in the thread's folder. It also appears in NoName's own page, where you can read it. Send new messages from one place at a time: NoName refuses a message while a turn in the same conversation is running.

## Not supported yet

- F4code's tools inside NoName, such as starting threads or reading other projects.
- Rolling a thread back to an earlier turn.
- Commit messages, pull request text, branch names, and thread titles. Pick another provider for those.

See [provider setup](./install.md#providers) and [Permission modes](./permission-modes.md).
