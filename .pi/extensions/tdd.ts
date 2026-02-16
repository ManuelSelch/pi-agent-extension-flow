import { ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

const enum Mode {
  Red = 'red',
  Green = 'green',
  Refactor = 'refactor',
}

let isTDD = false
let currentMode = Mode.Red
let waitingForAgentResponse = false // track if waiting for agent to finish
let didEdit = false

export default function (pi: ExtensionAPI) {
  pi.registerCommand("tdd", {
    description: "toggle TDD agent flow",
    handler: async (_iterSSEMessages, ctx) => {
        isTDD = !isTDD;
        
        ctx.ui.notify(isTDD ? "TDD enabled": "TDD disabled", "info");
    }
  })

  pi.registerCommand("tdd-red", {
    description: "set TDD mode to RED",
    handler: async (_iterSSEMessages, ctx) => {
        currentMode = Mode.Red;
        ctx.ui.notify("TDD mode is RED", "info");
    }
  })

  pi.registerCommand("tdd-green", {
    description: "set TDD mode to GREEN",
    handler: async (_iterSSEMessages, ctx) => {
        currentMode = Mode.Green;
        ctx.ui.notify("TDD mode is GREEN", "info");
    }
  })

  pi.registerCommand("tdd-refactor", {
    description: "set TDD mode to REFACTOR",
    handler: async (_iterSSEMessages, ctx) => {
        currentMode = Mode.Refactor;
        ctx.ui.notify("TDD mode is REFACTOR", "info");
    }
  })

  // verify writes to src / test folder
  pi.on("tool_call", (event, ctx) => {
    if(isToolCallEventType("bash", event)) {
      if(event.input.command.includes("ls -R"))
        return { block: true, reason: "you are not allowed to use recursive bash comand ls -R, use ls tool instead" }
    }

    if(!isTDD) return;

    let path = "";
    if(isToolCallEventType("write", event))
      path = event.input.path;
    else if(isToolCallEventType("edit", event))
      path = event.input.path;
    else 
      return;

    switch(currentMode) {
        case Mode.Red:
            if(isSrcFolder(path))
                return { block: true, reason: "in RED TDD mode, you are only allowed to edit test folder and not src folder" }
            break;
        
        case Mode.Green:
            if(isTestFolder(path))
                return { block: true, reason: "in GREEN TDD mode, you are only allowed to edit src folder and not test folder" }
            break;

        case Mode.Refactor:
            if(isTestFolder(path))
                return { block: true, reason: "in REFACTOR TDD mode, you are only allowed to edit src folder and not test folder" }
            break;
    }

    didEdit = true;
  })

  // check if iteration done
  pi.on("agent_end", (event, ctx) => {
    if(!isTDD) return;

    if(event.messages.join("\n").includes("[DONE]")) {
      waitingForAgentResponse = false;
      ctx.ui.notify("TDD COMPLETE", "info");
    }
  })

  // run tests after each turn
  pi.on("tool_execution_end", async (event, ctx) => {
    if(!isTDD) return;
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

      const feedbackMessage = formatTestFeedback(testPassed, testOutput, currentMode);
      
      pi.sendUserMessage(feedbackMessage, {deliverAs: "steer"});
       
    } catch(error: any) {
      let errorMessage = (error as Error).message;

      ctx.ui.notify("✗ Tests failed", "error");
      const feedbackMessage = formatTestFeedback(false, errorMessage, currentMode);

      pi.sendUserMessage(feedbackMessage, {deliverAs: "steer"});
    }
  })

}

function isSrcFolder(path: string) {
    return path.includes("src") && !path.includes("test");
}

function isTestFolder(path: string) {
    return path.includes("test");
}

function formatTestFeedback(passed: boolean, output: string, mode: Mode): string {
  const modeGuidance = getModeGuidance(mode, passed);
  
  return `
    ## Test Results (TDD ${mode.toUpperCase()} phase) 
    **Status:** ${passed ? '✓ PASSED' : '✗ FAILED'}
    ${modeGuidance}
    \`\`\`
    ${output.trim()}
    \`\`\`
  `
}


function getModeGuidance(mode: Mode, passed: boolean): string {
  if (passed) {
    switch(mode) {
      case Mode.Red:
        return "Tests should fail in RED mode. If they're not failing for the right reasons, adjust your test.";
      case Mode.Green:
        currentMode = Mode.Refactor;
        return "✓ Tests are passing! Mode will advance to REFACTOR - improve code quality without breaking tests.";
      case Mode.Refactor:
        waitingForAgentResponse = true;
        return "✓ Tests still passing after refactor! Ready for the next RED cycle. If you are DONE with refactoring reply with [DONE]";
    }
  } else {
    switch(mode) {
      case Mode.Red:
        currentMode = Mode.Green;
        return "✓ Tests are now failing as expected. Mode will advance to GREEN - implement the minimum code to make tests pass.";
      case Mode.Green:
        return "⚠ Tests are failing. Continue implementing until all tests pass.";
      case Mode.Refactor:
        return "⚠ Tests broke during refactor! Fix the code to restore green tests.";
    }
  }
}
