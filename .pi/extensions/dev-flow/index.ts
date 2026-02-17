import { ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent"
import { DevFlow, FlowMode } from "./dev-flow"

export default function (pi: ExtensionAPI) {
    let flow = new DevFlow(pi);

    flow.register();

    pi.registerCommand("dev-flow", {
        description: "enable dev agent flow",
        handler: async (_, ctx) => {
            ctx.ui.notify("dev flow enabled", "info");
            flow.initialize();
        }
    })

}