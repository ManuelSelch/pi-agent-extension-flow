import { ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent"

// Define configuration interface
interface TddConfig {
  testFolder: string
  srcFolder: string
  testCommand: string
}

// Possible modes
const enum Mode {
  Red = 'red',
  Green = 'green',
  Refactor = 'refactor',
}

let isTDD = false
let currentMode = Mode.Red

export default function (pi: ExtensionAPI) {
  pi.registerCommand("tdd", {
    description: "toggle TDD agent flow",
    handler: async (_iterSSEMessages, ctx) => {
        isTDD = !isTDD;
        
        ctx.ui.notify(isTDD ? "TDD enabled": "TDD disabled", "info");
    }
  })

  pi.registerCommand("tdd red", {
    description: "set TDD mode to RED",
    handler: async (_iterSSEMessages, ctx) => {
        currentMode = Mode.Red;
        ctx.ui.notify("TDD mode is RED", "info");
    }
  })

  pi.registerCommand("tdd green", {
    description: "set TDD mode to GREEN",
    handler: async (_iterSSEMessages, ctx) => {
        currentMode = Mode.Green;
        ctx.ui.notify("TDD mode is GREEN", "info");
    }
  })

  pi.registerCommand("tdd refactor", {
    description: "set TDD mode to REFACTOR",
    handler: async (_iterSSEMessages, ctx) => {
        currentMode = Mode.Refactor;
        ctx.ui.notify("TDD mode is REFACTOR", "info");
    }
  })

  pi.on("tool_call", (event, ctx) => {
    if(!isTDD) return;
    if(!isToolCallEventType("write", event)) return;

    switch(currentMode) {
        case Mode.Red:
            if(isSrcFolder(event.input.path))
                return { block: true, reason: "in RED TDD mode, you are only allowed to edit test folder and not src folder" }
            break;
        
        case Mode.Green:
            if(isTestFolder(event.input.path))
                return { block: true, reason: "in GREEN TDD mode, you are only allowed to edit src folder and not test folder" }
            break;

        case Mode.Refactor:
            if(isTestFolder(event.input.path))
                return { block: true, reason: "in REFACTOR TDD mode, you are only allowed to edit src folder and not test folder" }
            break;
    }
  })
}

function isSrcFolder(path: string) {
    return path.includes("src");
}

function isTestFolder(path: string) {
    return path.includes("test");
}