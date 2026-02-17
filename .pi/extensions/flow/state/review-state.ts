import { ExtensionContext, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { Task } from "../util/task-storage";
import { Session } from "../util/session";
import { State, StateName } from "./state";

const REVIEW_PROMPT = `
You are now in REVIEW mode.
Your implementation is being reviewed for correctness and quality.
Wait for the review results before proceeding.
`;

export type ReviewResult = {
    success: boolean;
    feedback: string;
};

export class ReviewState implements State {
    readonly name: StateName = 'review';

    constructor(private session: Session) {}

    async onEnter(task: Task, ctx: ExtensionContext): Promise<string> {
        // Update session status
        await this.session.updateStatus('reviewing');

        ctx.ui.notify(`Flow: REVIEW mode - ${task.name}`, "info");

        // Run the review process
        const result = await this.review(ctx);

        if (result.success) {
            await this.session.completeSession();
            return `SUCCESS: ${result.feedback}. Task completed!`;
        } else {
            return `FAILED: ${result.feedback}. Review rejected. Return to DEV mode to fix issues.`;
        }
    }

    async onExit(ctx: ExtensionContext): Promise<void> {
        ctx.ui.notify("Flow: Leaving REVIEW", "info");
    }

    async onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<{ block: boolean; reason?: string } | void> {
        // In REVIEW mode, all tools are allowed (read-only operations mostly)
        return undefined;
    }

    async onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void> {
        // No special handling
    }

    getPrompt(task: Task): string {
        return REVIEW_PROMPT;
    }

    canTransitionTo(targetState: string): boolean {
        // Can transition to idle (success) or back to dev (failure)
        return targetState === 'idle' || targetState === 'dev';
    }

    /**
     * Run the review process.
     */
    private async review(ctx: ExtensionContext): Promise<ReviewResult> {
        // TODO: Add automated checks (linter, tests)
        // const linter = await this.runLinter(ctx);
        // const tests = await this.runTests(ctx);

        return await this.reviewByHuman(ctx);
    }

    private async reviewByHuman(ctx: ExtensionContext): Promise<ReviewResult> {
        const userConfirmed = await ctx.ui.confirm(
            "Review Task",
            "Did the agent implement the task successfully?"
        );

        if (!userConfirmed) {
            return {
                success: false,
                feedback: "User reviewed the code implementation and denied it. Fix the issues and submit again."
            };
        }

        return {
            success: true,
            feedback: "User reviewed the code implementation and approved it. Full review pipeline passed."
        };
    }
}
