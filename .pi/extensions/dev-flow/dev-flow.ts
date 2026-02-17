import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export enum FlowMode {
  IDLE,
  DEV,
  REVIEW
}

export type Task = {
    name: string,
    description: string
}

const INTRODUCTION = `
You are developer and have to follow a strict flow. A state machine will guide you.
Your current state is: IDLE. 
This means you have to pick your next open tasks by calling the list-tasks tool and select it using the select-task tool
`

// development flow (IDLE, DEV, REVIEW)
export class DevFlow {
    constructor(pi: ExtensionAPI) {
        this.pi = pi;
    }

    register() {
        this.registerTool_ListTasks();
        this.registerTool_SelectTask();
    }

    initialize() {
        this.currentMode = FlowMode.IDLE;
        this.sendMessage(INTRODUCTION);
    }

    //#region list-tasks
    private registerTool_ListTasks() {
        this.pi.registerTool({
            name: "list-tasks",
            label: "list tasks",
            description: "list all open tasks",
            parameters: Type.Object({}),

            execute: async (_toolCallId, _params, _signal, _onUpdate, _ctx) => {
                const result = this.listTasks();
                return {
                    content: [{ type: "text", text: result }],
                    details: {},
                };
            },
        });
    }

    private listTasks(): string {
        let openTasks = JSON.stringify(this.tasks);
        return `SUCCESS: your current open tasks are: ${openTasks}`
    }
    //#endregion

    //#region select task
    private registerTool_SelectTask() {
        this.pi.registerTool({
            name: "select-task",
            label: "select task",
            description: "select open task to implement next",
            parameters: Type.Object({
                name: Type.String({description: "the task name to select"})
            }),

            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const result = await this.selectTask(params.name, ctx);
                return {
                    content: [{ type: "text", text: result }],
                    details: {},
                };
            },
        });
    }

    private async selectTask(name: string, ctx: ExtensionContext): Promise<string> {
        if(this.currentMode != FlowMode.IDLE) return `FAILED: you are only allowed to select a task in IDLE mode, but you are currently in ${FlowMode[this.currentMode]}`

        const selectedTask = this.tasks.find(t => t.name == name);
        if(selectedTask == undefined) return `FAILED: your selected task does not exist. Use list-tasks tool to see open tasks and then try again the select-task tool`

        const userConfirmedTask = await ctx.ui.confirm("Confirm Task", `selected task is ${selectedTask}`)
        if(!userConfirmedTask) return `FAILED: user denied selecting this task. Wait for user input before proceeding.`

        this.currentTask = selectedTask;
        this.currentMode = FlowMode.DEV;
        this.deleteTask(selectedTask);

        return `SUCCESS: you selected task "${name}". Task description: "${this.currentTask.description}". You are now in DEV mode to implement the selected task.`
    }

    private deleteTask(task: Task) {
        const index = this.tasks.indexOf(task);
        if (index !== -1) this.tasks.splice(index, 1);
    }
    //#endregion

    //#region helper
    private sendMessage(msg: string) {
        // sends user message to agent
        this.pi.sendUserMessage(msg, {deliverAs: "steer"});
    }
    //#endregion

    //#region properties
    private pi: ExtensionAPI
    private currentMode = FlowMode.IDLE;
    private tasks: Task[] = [
        {name: "add delete method", "description": "implement a delete() method in src/index.ts to delete todo items"}
    ]
    private currentTask: Task | undefined = undefined;
    //#endregion
}