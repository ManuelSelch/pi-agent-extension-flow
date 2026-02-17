import { ExtensionAPI, ExtensionContext, isToolCallEventType, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Task } from "../util/task-storage";
import { Session } from "../util/session";
import { State, StateName } from "./state";

const execAsync = promisify(exec);

enum TddMode {
    RED,
    GREEN,
    REFACTOR
}

const DEV_PROMPT = `
You are now in DEV state to implement the selected task. 
Proceed autonomous without asking for user permissions. 
In DEV state you have to follow RED, GREEN, REFACTOR. 
You are now in RED DEV mode. 
RED DEV mode: write a failing test first. 
GREEN DEV mode: implement it to pass the test
REFACTOR: refactor the code while keeping the tests passing
When you finished this task, then use the review-task tool to let the user review it.
`;

export class DevState implements State {
    readonly name: StateName = 'dev';
    
    private tddMode: TddMode = TddMode.RED;
    private didEdit = false;
    private waitingForAgentResponse = false;

    constructor(private pi: ExtensionAPI, private session: Session) {}

    async onEnter(task: Task, ctx: ExtensionContext): Promise<string> {
        this.tddMode = TddMode.RED;
        this.didEdit = false;
        
        // Update session status
        await this.session.updateStatus('developing');
        
        ctx.ui.notify("Flow: DEV state (TDD: RED)", "info");
        
        return DEV_PROMPT;
    }

    async onExit(ctx: ExtensionContext): Promise<void> {
        ctx.ui.notify("Flow: Leaving DEV", "info");
    }

    async onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<{ block: boolean; reason?: string } | void> {        
        // Only handle write/edit for TDD restrictions
        if (event.toolName !== 'write' && event.toolName !== 'edit') return;
        
        const path = event.input.path as string;
        
        switch (this.tddMode) {
            case TddMode.RED:
                if (isSrcFolder(path))
                    return { block: true, reason: "In RED TDD mode, you are only allowed to edit test folder and not src folder" };
                break;    
            case TddMode.GREEN:
            case TddMode.REFACTOR:
                if (isTestFolder(path)) 
                    return { block: true, reason: `In ${TddMode[this.tddMode]} TDD mode, you are only allowed to edit src folder and not test folder` };
                break;
        }
        
        this.didEdit = true;
        return undefined;
    }

    async onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void> {
        if (this.waitingForAgentResponse) return;
        if (!this.didEdit) return;
        
        this.didEdit = false;
        
        // Run tests after edits
        const feedback = await this.runTests(ctx);
        this.pi.sendUserMessage(feedback, { deliverAs: "steer" });
    }

    getPrompt(task: Task): string {
        return DEV_PROMPT;
    }

    canTransitionTo(targetState: string): boolean {
        // Can only transition to review from dev
        return targetState === 'review';
    }

    /**
     * Run tests and return formatted feedback.
     */
    private async runTests(ctx: ExtensionContext): Promise<string> {
        ctx.ui.notify("Running tests...", "info");

        try {
            const { stdout, stderr } = await execAsync("npm test", {
                cwd: process.cwd(),
                timeout: 5000
            });

            const testOutput = stdout + (stderr ? `\n${stderr}` : '');
            const testPassed = !stderr.includes('FAIL') && !stderr.includes('failed');

            return this.formatTestFeedback(testPassed, testOutput);
        } catch (error: any) {
            return this.formatTestFeedback(false, JSON.stringify(error));
        }
    }

    private formatTestFeedback(passed: boolean, output: string): string {
        const modeGuidance = this.getModeGuidance(passed);
        
        return `
## Test Results (TDD ${TddMode[this.tddMode]} phase)
**Status:** ${passed ? '✓ PASSED' : '✗ FAILED'}
${modeGuidance}
\`\`\`
${output.trim()}
\`\`\`
        `;
    }

    private getModeGuidance(passed: boolean): string {
        if (passed) {
            switch (this.tddMode) {
                case TddMode.RED:
                    return "Tests should fail in RED mode. If they're not failing for the right reasons, adjust your test.";
                case TddMode.GREEN:
                    this.tddMode = TddMode.REFACTOR;
                    return "✓ Tests are passing! State will advance to REFACTOR - improve code quality without breaking tests.";
                case TddMode.REFACTOR:
                    return "✓ Tests still passing after refactor! Ready for the next RED cycle. If you are DONE with refactoring reply with [DONE]";
            }
        } else {
            switch (this.tddMode) {
                case TddMode.RED:
                    this.tddMode = TddMode.GREEN;
                    return "✓ Tests are now failing as expected. State will advance to GREEN - implement the minimum code to make tests pass.";
                case TddMode.GREEN:
                    return "⚠ Tests are failing. Continue implementing until all tests pass.";
                case TddMode.REFACTOR:
                    return "⚠ Tests broke during refactor! Fix the code to restore green tests.";
            }
        }
    }
}

//#region detect folder helper
function isSrcFolder(path: string): boolean {
    return path.includes("src") && !path.includes("test");
}

function isTestFolder(path: string): boolean {
    return path.includes("test");
}
//#endregion