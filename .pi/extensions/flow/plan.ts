import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Task } from "./task-storage";

export type PlanResult = {
    success: boolean,
    requirements: string
}

/**
 * Plan phase - analyze task requirements before development.
 * In PLAN mode, the agent analyzes the selected task to understand:
 * - What needs to be implemented
 * - What are the requirements
 * - What approach should be taken
 */
export class Plan {
    constructor(pi: ExtensionAPI) {
        this.pi = pi;
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
     * Returns the analyzed requirements.
     */
    async plan(task: Task, ctx: ExtensionContext): Promise<PlanResult> {
        ctx.ui.notify(`Starting planning phase for: ${task.name}`, "info");
        
        // In PLAN mode, the agent will analyze the task
        // The actual planning logic is driven by the agent through messages
        // This method sets up the context and returns success
        
        return { 
            success: true, 
            requirements: `Task "${task.name}" needs to be analyzed. Description: ${task.description}` 
        };
    }

    /**
     * Complete the planning phase and transition to DEV.
     * Called when agent has finished analyzing requirements.
     */
    async complete(ctx: ExtensionContext): Promise<PlanResult> {
        const userConfirmed = await ctx.ui.confirm(
            "Planning Complete", 
            "Has the task been properly analyzed and requirements understood?"
        );

        if (!userConfirmed) {
            return { 
                success: false, 
                requirements: "User rejected the planning. Continue analyzing the task requirements." 
            };
        }

        return { 
            success: true, 
            requirements: "Planning complete. Ready to proceed to development." 
        };
    }

    private pi: ExtensionAPI;
    private isEnabled = false;
}
