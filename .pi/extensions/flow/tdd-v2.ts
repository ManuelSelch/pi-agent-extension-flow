import { ExtensionAPI, ExtensionContext, isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

enum Mode {
  RED,
  GREEN,
  REFACTOR
}

// TDD (test-driven-development) flow
export class TDD {
    constructor(pi: ExtensionAPI) {
        this.pi = pi;
    }

    register() {
        // verify writes to src / test folder
        this.pi.on("tool_call", (event, ctx) => {
            if(!this.isEnabled) return;
    
            let path = "";
            if(isToolCallEventType("write", event))
            path = event.input.path;
            else if(isToolCallEventType("edit", event))
            path = event.input.path;
            else 
            return;
    
            switch(this.currentMode) {
                case Mode.RED:
                    if(isSrcFolder(path))
                        return { block: true, reason: "in RED TDD mode, you are only allowed to edit test folder and not src folder" }
                    break;
                
                case Mode.GREEN:
                    if(isTestFolder(path))
                        return { block: true, reason: "in GREEN TDD mode, you are only allowed to edit src folder and not test folder" }
                    break;
    
                case Mode.REFACTOR:
                    if(isTestFolder(path))
                        return { block: true, reason: "in REFACTOR TDD mode, you are only allowed to edit src folder and not test folder" }
                    break;
            }
    
            this.didEdit = true;
        })

        // run tests after each turn
        this.pi.on("tool_execution_end", async (event, ctx) => {
            if(!this.isEnabled) return;
            if(this.waitingForAgentResponse) return;

            if(!this.didEdit) return;

            this.didEdit = false;

            ctx.ui.notify("Running tests...", "info");

            try {
                const { stdout, stderr } = await execAsync("npm test", {
                    cwd: process.cwd(),
                    timeout: 5_000 
                });

                const testOutput = stdout + (stderr ? `\n${stderr}` : '');
                const testPassed = !stderr.includes('FAIL') && !stderr.includes('failed');

                const feedbackMessage = this.formatTestFeedback(testPassed, testOutput, this.currentMode);
                
                this.pi.sendUserMessage(feedbackMessage, {deliverAs: "steer"});
                
            } catch(error: any) {
                let errorMessage = (error as Error).message;

                ctx.ui.notify("✗ Tests failed", "error");
                const feedbackMessage = this.formatTestFeedback(false, errorMessage, this.currentMode);

                this.pi.sendUserMessage(feedbackMessage, {deliverAs: "steer"});
            }
        })
    }

    start(ctx: ExtensionContext) {
        this.isEnabled = true;
        this.currentMode = Mode.RED;

        ctx.ui.notify("TDD mode is now: RED");
    }

    stop(ctx: ExtensionContext) {
        this.isEnabled = false;
        ctx.ui.notify("TDD stopped");
    }
    


    private formatTestFeedback(passed: boolean, output: string, mode: Mode): string {
        const modeGuidance = this.getModeGuidance(mode, passed);
        
        return `
            ## Test Results (TDD ${mode} phase) 
            **Status:** ${passed ? '✓ PASSED' : '✗ FAILED'}
            ${modeGuidance}
            \`\`\`
            ${output.trim()}
            \`\`\`
        `
    }


    private getModeGuidance(mode: Mode, passed: boolean): string {
        if (passed) {
            switch(mode) {
            case Mode.RED:
                return "Tests should fail in RED mode. If they're not failing for the right reasons, adjust your test.";
            case Mode.GREEN:
                this.currentMode = Mode.REFACTOR;
                return "✓ Tests are passing! Mode will advance to REFACTOR - improve code quality without breaking tests.";
            case Mode.REFACTOR:
                return "✓ Tests still passing after refactor! Ready for the next RED cycle. If you are DONE with refactoring reply with [DONE]";
            }
        } else {
            switch(mode) {
            case Mode.RED:
                this.currentMode = Mode.GREEN;
                return "✓ Tests are now failing as expected. Mode will advance to GREEN - implement the minimum code to make tests pass.";
            case Mode.GREEN:
                return "⚠ Tests are failing. Continue implementing until all tests pass.";
            case Mode.REFACTOR:
                return "⚠ Tests broke during refactor! Fix the code to restore green tests.";
            }
        }
    }


    private pi: ExtensionAPI;
    private isEnabled = false;
    private didEdit = false;
    private waitingForAgentResponse = false;
    private currentMode: Mode = Mode.RED;
}


function isSrcFolder(path: string) {
    return path.includes("src") && !path.includes("test");
}

function isTestFolder(path: string) {
    return path.includes("test");
}

