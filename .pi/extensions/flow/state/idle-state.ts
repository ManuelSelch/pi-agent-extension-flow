import { ExtensionContext, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { Task } from "../util/task-storage";
import { State, StateName } from "./state";

const IDLE_PROMPT = `
You are developer and have to follow a strict flow. A state machine will guide you.
Your current state is: IDLE. 
This means you have to autonomous pick your next open tasks by calling the list-tasks tool and select it using the select-task tool without asking for permission from user
`;

export class IdleState implements State {

    constructor() {}

    async onEnter(task: Task, ctx: ExtensionContext): Promise<string> {
        // No tool blocking in idle
        ctx.ui.notify("Flow: IDLE mode", "info");
        return IDLE_PROMPT;
    }

    async onExit(ctx: ExtensionContext): Promise<void> {
        // Nothing to clean up in idle
        ctx.ui.notify("Flow: Leaving IDLE", "info");
    }

    async onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<{ block: boolean; reason?: string } | void> {
        // block write & edit
        if(event.toolName == "write" || event.toolName == "edit")
            return { block: true, reason: "You are not allowed to write or edit files in IDLE mode." }
    }

    async onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void> {
        // No special handling
    }
}
