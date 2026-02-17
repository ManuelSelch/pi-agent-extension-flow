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

const IDLE_TEXT = `
You are developer and have to follow a strict flow. A state machine will guide you.
Your current state is: IDLE. 
This means you have to autonomous pick your next open tasks by calling the list-tasks tool and select it using the select-task tool without asking for permission from user
`

const DEV_TEXT = `
You are now in DEV mode to implement the selected task. 
Proceed autonomous without asking for user permissions. 
When you understood this text, then use the review-task tool to let the user review it.
You do not need to implement it. Just use now the tool review-task.
`


// development flow (IDLE, DEV, REVIEW)
export class DevFlow {
    constructor(pi: ExtensionAPI) {
        this.pi = pi;
    }

    register() {
        this.registerCommand_initialize();
        this.registerTool_listTasks();
        this.registerTool_selectTask();
        this.registerTool_reviewTask();
    }

    //#region initialize
    private registerCommand_initialize() {
        this.pi.registerCommand("dev-flow", {
            description: "initialize dev agent flow",
            handler: async (_, ctx) => {
                ctx.ui.notify("dev flow enabled", "info");
                this.initialize();
            }
        })
    }

    private initialize() {
        this.currentMode = FlowMode.IDLE;
        this.sendMessage(IDLE_TEXT);
    }
    //#endregion

    //#region list-tasks
    private registerTool_listTasks() {
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
        let taskNames = this.tasks.map(t => t.name).join(",");
        return `SUCCESS: your current open tasks are: ${taskNames}`
    }
    //#endregion

    //#region select task
    private registerTool_selectTask() {
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

        const userConfirmedTask = await ctx.ui.confirm("Confirm Task", `selected task is ${selectedTask.name}`)
        if(!userConfirmedTask) return `FAILED: user denied selecting this task. Wait for user input before proceeding.`

        this.currentTask = selectedTask;
        this.currentMode = FlowMode.DEV;
        this.deleteTask(selectedTask);

        return `SUCCESS: you selected task "${name}". Task description: "${this.currentTask.description}". ${DEV_TEXT}`
    }

    private deleteTask(task: Task) {
        const index = this.tasks.indexOf(task);
        if (index !== -1) this.tasks.splice(index, 1);
    }
    //#endregion

    //#region review task
    private registerTool_reviewTask() {
        this.pi.registerTool({
            name: "review-task",
            label: "review task",
            description: "review yout task implementation by user to verify that your implementation is correct.",
            parameters: Type.Object({}),

            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const result = await this.reviewTask(ctx);
                return {
                    content: [{ type: "text", text: result }],
                    details: {},
                };
            },
        });
    } 

    private async reviewTask(ctx: ExtensionContext): Promise<string> {
        const userConfirmed = await ctx.ui.confirm("Review Task", "did agent implement task successfully?");

        if(!userConfirmed) return `FAILED: user reviewed your code implementation and denied it. Wait for input form user before proceeding.`;

        this.currentMode = FlowMode.IDLE;
        return `SUCCESS: user reviewed your code implementation and approved it. ${IDLE_TEXT}`
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
        {name: "implement delete method", "description": "implement a delete() method in src/index.ts to delete todo items"},
        {name: "implement filter method", "description": "implement a filter(search: string) method in src/index.ts to search for specific todo items"}
    ]
    private currentTask: Task | undefined = undefined;
    //#endregion
}