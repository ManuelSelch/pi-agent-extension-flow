import { ExtensionContext, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { Task } from "../util/task-storage";
import { Session } from "../util/session";
import { State, StateName } from "./state";

const PLAN_PROMPT = `
You are now in PLAN state to analyze the selected task.
Proceed autonomous without asking for user permissions.
IMPORTANT: You are NOT allowed to write or edit files in PLAN mode. These tools are blocked.
Analyze the task requirements thoroughly:
- Understand what needs to be implemented
- Identify potential challenges
- Plan your approach
- Consider edge cases
When you have completed the analysis and understand the requirements, use the start-dev tool with your gathered requirements to proceed to development.
`;

export type PlanResult = {
    success: boolean;
    requirements: string;
};

export class PlanState implements State {
    constructor(private session: Session) {}

    async onEnter(task: Task, ctx: ExtensionContext): Promise<string> {        
        // Start a new session for this task
        await this.session.startSession(task.name);
        
        ctx.ui.notify(`Flow: PLAN state - ${task.name}`, "info");
        
        return `You selected task "${task.name}" ${PLAN_PROMPT}`;
    }

    async onExit(ctx: ExtensionContext): Promise<void> {
        ctx.ui.notify("Flow: Leaving PLAN", "info");
    }

    async onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<{ block: boolean; reason?: string } | void> {
        // Block write and edit tools in PLAN mode
        if (event.toolName === 'write' || event.toolName === 'edit') {
            return {
                block: true,
                reason: `Tool "${event.toolName}" is blocked in PLAN mode. Complete planning first by using the start-dev tool to proceed to development.`
            };
        }
        
        return undefined;
    }

    async onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void> {
        // No special handling
    }

    getPrompt(task: Task): string {
        return PLAN_PROMPT;
    }

    /**
     * Complete the planning phase.
     * Called by Flow when start-dev tool is used.
     */
    async complete(requirements: string, ctx: ExtensionContext): Promise<PlanResult> {
        const userConfirmed = await ctx.ui.confirm(
            "Planning Complete",
            `Has the task been properly analyzed?\n\nRequirements:\n${requirements}`
        );

        if (!userConfirmed) {
            return {
                success: false,
                requirements: "User rejected the planning. Continue analyzing the task requirements."
            };
        }

        // Save requirements to session
        await this.session.saveRequirements(requirements);

        return {
            success: true,
            requirements
        };
    }
}
