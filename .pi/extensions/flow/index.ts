import { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Flow } from "./flow"

export default function (pi: ExtensionAPI) {
    let flow = new Flow(pi);

    flow.register();
}