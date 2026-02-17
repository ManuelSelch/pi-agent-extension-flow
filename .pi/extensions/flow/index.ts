import { ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent"
import { Flow } from "./flow"

export default function (pi: ExtensionAPI) {
    let flow = new Flow(pi);

    flow.register();

    // disable ls -R
    pi.on("tool_call", (event, ctx) => {
        if(isToolCallEventType("bash", event)) {
            if(event.input.command.includes("ls -R"))
                return { block: true, reason: "you are not allowed to use recursive bash comand ls -R, use ls instead without -R" }
        }
    })
}