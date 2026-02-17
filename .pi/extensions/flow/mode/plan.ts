import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Task } from "../util/task-storage";
import { Session } from "../util/session";
import { resolve } from "node:path";

export type PlanResult = {
    success: boolean,
    requirements: string
}

const PLAN_TEXT = `
You are now in PLAN mode to analyze the selected task.
Proceed autonomous without asking for user permissions.
IMPORTANT: You are NOT allowed to write or edit files in PLAN mode. These tools are blocked.
Analyze the task requirements thoroughly:
- Understand what needs to be implemented
- Identify potential challenges
- Plan your approach
- Consider edge cases
When you have completed the analysis and understand the requirements, use the start-dev tool with your gathered requirements to proceed to development.
`

/**
 * Plan phase - analyze task requirements before development.
 * In PLAN mode, the agent analyzes the selected task to understand:
 * - What needs to be implemented
 * - What are the requirements
 * - What approach should be taken
 */
export class Plan {
    constructor(pi: ExtensionAPI, session: Session) {
        this.pi = pi;
        this.session = session;
    }

    register() {
        this.pi.on("tool_call", async (event, ctx) => {
            if (!this.isEnabled) return;

            // block write and edit tools in PLAN mode
            if (event.toolName === "write" || event.toolName === "edit")
                return { block: true,  reason: `Tool "${event.toolName}" is blocked in PLAN mode. Complete planning first by using the start-dev tool to proceed to development.` };
        });
    }

    /**
     * Start the planning phase for a task.
     * Creates a new session and returns the planning instructions.
     */
    async start(task: Task, ctx: ExtensionContext): Promise<string> {
        ctx.ui.notify(`Starting planning phase for: ${task.name}`, "info");
        
        // Start a new session for this task
        await this.session.startSession(task.name);
        
        // Enable tool blocking
        this.isEnabled = true;
        
        return `You selected task "${task.name}"" ${PLAN_TEXT}`;
    }

    /**
     * Complete the planning phase and transition to DEV.
     * Called when agent has finished analyzing requirements.
     * @param requirements The gathered requirements from planning analysis
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
        
        // Disable tool blocking
        this.isEnabled = false;

        return { 
            success: true, 
            requirements 
        };
    }

    private pi: ExtensionAPI;
    private session: Session;
    private isEnabled = false;
}
