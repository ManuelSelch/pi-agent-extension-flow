import { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { DevFlow } from "./dev-flow"

export default function (pi: ExtensionAPI) {
    let flow = new DevFlow(pi);

    flow.register();
}