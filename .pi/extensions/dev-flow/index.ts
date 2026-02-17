import { ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

enum Mode {
  IDLE,
  DEV,
  REVIEW
}

enum TDDMode {
  RED,
  GREEN,
  REFACTOR
}

let isEnabled = false
let currentMode = Mode.IDLE
let currentTDDMode = TDDMode.RED
let waitingForAgentResponse = false // track if waiting for agent to finish
let didEdit = false

export default function (pi: ExtensionAPI) {
  pi.registerCommand("dev-flow", {
    description: "toggle dev agent flow",
    handler: async (_, ctx) => {
        isEnabled = !isEnabled;
        ctx.ui.notify(isEnabled ? "dev flow enabled": "dev flow disabled", "info");

        if(!isEnabled) return;

        currentMode = Mode.IDLE;
        sendMessage("");
    }
  })

  // verify writes to src / test folder
  pi.on("tool_call", (event, ctx) => {
    if(isToolCallEventType("bash", event)) {
      if(event.input.command.includes("ls -R"))
        return { block: true, reason: "you are not allowed to use recursive bash comand ls -R, use ls tool instead" }
    }

    if(!isEnabled) return;

    let path = "";
    if(isToolCallEventType("write", event))
      path = event.input.path;
    else if(isToolCallEventType("edit", event))
      path = event.input.path;
    else 
      return;

    switch(currentTDDMode) {
        case TDDMode.RED:
            if(isSrcFolder(path))
                return { block: true, reason: "in RED TDD mode, you are only allowed to edit test folder and not src folder" }
            break;
        
        case TDDMode.GREEN:
            if(isTestFolder(path))
                return { block: true, reason: "in GREEN TDD mode, you are only allowed to edit src folder and not test folder" }
            break;

        case TDDMode.REFACTOR:
            if(isTestFolder(path))
                return { block: true, reason: "in REFACTOR TDD mode, you are only allowed to edit src folder and not test folder" }
            break;
    }

    didEdit = true;
  })

  // check if iteration done
  pi.on("agent_end", (event, ctx) => {
    if(!isEnabled) return;

    if(event.messages.join("\n").includes("[DONE]")) {
      waitingForAgentResponse = false;
      ctx.ui.notify("TDD COMPLETE", "info");
    }
  })

  // run tests after each turn
  pi.on("tool_execution_end", async (event, ctx) => {
    if(!isEnabled) return;
    if(waitingForAgentResponse) return;

    if(!didEdit) return;

    didEdit = false;

    ctx.ui.notify("Running tests...", "info");

    try {
      const { stdout, stderr } = await execAsync("npm test", {
        cwd: process.cwd(),
        timeout: 5_000 
      });

      const testOutput = stdout + (stderr ? `\n${stderr}` : '');
      const testPassed = !stderr.includes('FAIL') && !stderr.includes('failed');

      const feedbackMessage = formatTestFeedback(testPassed, testOutput, currentTDDMode);
      
      pi.sendUserMessage(feedbackMessage, {deliverAs: "steer"});
       
    } catch(error: any) {
      let errorMessage = (error as Error).message;

      ctx.ui.notify("✗ Tests failed", "error");
      const feedbackMessage = formatTestFeedback(false, errorMessage, currentTDDMode);

      pi.sendUserMessage(feedbackMessage, {deliverAs: "steer"});
    }
  })

  function sendMessage(msg: string) {
    // sends user message to agent
    pi.sendUserMessage(msg, {deliverAs: "steer"});
  }
}

function isSrcFolder(path: string) {
    return path.includes("src") && !path.includes("test");
}

function isTestFolder(path: string) {
    return path.includes("test");
}

function formatTestFeedback(passed: boolean, output: string, mode: TDDMode): string {
  const modeGuidance = getModeGuidance(mode, passed);
  
  return `
    ## Test Results (TDD ${mode} phase) 
    **Status:** ${passed ? '✓ PASSED' : '✗ FAILED'}
    ${modeGuidance}
    \`\`\`
    ${output.trim()}
    \`\`\`
  `
}


function getModeGuidance(mode: TDDMode, passed: boolean): string {
  if (passed) {
    switch(mode) {
      case TDDMode.RED:
        return "Tests should fail in RED mode. If they're not failing for the right reasons, adjust your test.";
      case TDDMode.GREEN:
        currentTDDMode = TDDMode.REFACTOR;
        return "✓ Tests are passing! Mode will advance to REFACTOR - improve code quality without breaking tests.";
      case TDDMode.REFACTOR:
        waitingForAgentResponse = true;
        return "✓ Tests still passing after refactor! Ready for the next RED cycle. If you are DONE with refactoring reply with [DONE]";
    }
  } else {
    switch(mode) {
      case TDDMode.RED:
        currentTDDMode = TDDMode.GREEN;
        return "✓ Tests are now failing as expected. Mode will advance to GREEN - implement the minimum code to make tests pass.";
      case TDDMode.GREEN:
        return "⚠ Tests are failing. Continue implementing until all tests pass.";
      case TDDMode.REFACTOR:
        return "⚠ Tests broke during refactor! Fix the code to restore green tests.";
    }
  }
}
