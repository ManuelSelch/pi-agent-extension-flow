
const IDLE_TEXT = `
You are developer and have to follow a strict flow. A state machine will guide you.
Your current state is: IDLE. 
This means you have to autonomous pick your next open tasks by calling the list-tasks tool and select it using the select-task tool without asking for permission from user
`

export class Idle {
    constructor() {

    }

    start() {
        this.isEnabled = true;

        return IDLE_TEXT;
    }

    stop() {
        this.isEnabled = false;
    }

    private isEnabled = false;
}