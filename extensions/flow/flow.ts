import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { IdleState } from "./state/idle-state";
import { PlanState } from "./state/plan-state";
import { DevState } from "./state/dev-state";
import { ReviewState } from "./state/review-state";
import { resolve } from "node:path";
import { Task, TaskStorage } from "./util/task-storage";
import { Session } from "./util/session";
import { State } from "./state/state";

export enum FlowMode {
  IDLE,
  PLAN,
  DEV,
  REVIEW
}

export type StateName = 'idle' | 'plan' | 'dev' | 'review';    

// development flow (IDLE, PLAN, DEV, REVIEW)
export class Flow {
    constructor(pi: ExtensionAPI) {
        this.pi = pi;
        this.taskStorage = new TaskStorage(resolve(process.cwd(), 'tasks.md'));
        this.session = new Session(resolve(process.cwd(), 'session.json'));

        this.states = {
            'idle': new IdleState(),
            'plan': new PlanState(this.session),
            'dev': new DevState(pi, this.session),
            'review': new ReviewState(this.session)
        }
    }

    register() {
        this.registerCommand_start();
        this.registerCommand_resume();
        this.registerCommand_stop();

        this.registerTool_selectTask();
        this.registerTool_startDev();
        this.registerTool_reviewTask();

        this.pi.on("agent_end", async (event, ctx) => {
            if(this.currentState == undefined) return;
            await this.verifyAgentIsDone();
        })

        this.pi.on("tool_call", async (event, ctx) => {
            if(this.currentState == undefined) return;
            this.states[this.currentState].onToolCall(event, ctx);
        })
        
        this.pi.on("tool_result", async (event, ctx) => {
            if(this.currentState == undefined) return;
            this.states[this.currentState].onToolResult(event, ctx);
        })
    }

    private async verifyAgentIsDone() {        
        const tasksAreEmpty = ((await this.taskStorage.getTasks()).filter(t => !t.isDone)).length == 0;

        if(this.currentState == "idle" && tasksAreEmpty) return;

        let message = `You are not done yet. Your current state is: ${this.currentState}. `;

        if(this.currentState == "idle")
            message += `In IDLE state you have to select the next open task using list-tasks tool and select-task tool`;
        if(this.currentState == "plan")
            message += `In PLAN state you have to analyze the task requirements. When analysis is complete, use the start-dev tool with your gathered requirements to proceed to development.`;
        else if(this.currentState == "dev")
            message += `In DEV state you have to implement your task. When you are done, then call the review-task tool to review your code.`;

        this.sendMessage(message);
    }

    //#region command: start
    private registerCommand_start() {
        this.pi.registerCommand("start-flow", {
            description: "start agent flow",
            handler: async (_, ctx) => {
                ctx.ui.notify("start flow", "info");
                this.sendMessage(await this.transition("idle", ctx));
            }
        })
    }
    //#endregion

    //#region command: resume
    private registerCommand_resume() {
        this.pi.registerCommand("resume-flow", {
            description: "resume the current flow from session.json",
            handler: async (_, ctx) => {
                ctx.ui.notify("resume flow", "info");

                const sessionData = await this.session.readSession();
                if (!sessionData) {
                    ctx.ui.notify("No active session found. Start a new session by selecting a task.", "error");
                    return;
                }

                // Reconstruct the task from session data
                this.currentTask = {
                    name: sessionData.taskName,
                    isDone: false
                };

                // Build resume message with description if available
                const descriptionMsg = sessionData.description ? `\n\nTask Description: ${sessionData.description}` : '';

                // Resume based on status
                switch (sessionData.status) {
                    case 'planning':
                        ctx.ui.notify(`Resume planning session for task: ${this.currentTask.name}`, "info");
                        this.sendMessage(await this.transition("plan", ctx) + descriptionMsg);
                        break;
                    case 'developing':
                        ctx.ui.notify(`Resume development session for task: ${this.currentTask.name}`, "info");
                        this.sendMessage(await this.transition("dev", ctx) + descriptionMsg);
                        break;
                    case 'reviewing':
                        ctx.ui.notify(`Resume review session for task: ${this.currentTask.name}`, "info");
                        this.sendMessage(await this.transition("review", ctx) + descriptionMsg);
                        break;
                    default:
                        ctx.ui.notify(`Unknown session status: ${sessionData.status}`, "error");
                }
            }
        });
    }
    //#endregion

    //#region command: stop
    private registerCommand_stop() {
        this.pi.registerCommand("stop-flow", {
            description: "stops agent flow",
            handler: async (_, ctx) => {
                ctx.ui.notify("stop flow", "info");

                if(this.currentState) {
                    await this.states[this.currentState].onExit(ctx);
                    this.currentState = undefined;
                }
            }
        });
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
        if(this.currentState != "idle") return `FAILED: you are only allowed to select a task in IDLE state, but you are in ${this.currentState} state`

        if(name == undefined || name.trim() == "") return `FAILED: you need to provide a name as parameter that defines the task name`

        const tasks = await this.taskStorage.getTasks();
        const selectedTask = tasks.find(t => t.name == name);
        if(selectedTask == undefined) return `FAILED: your selected task "${name}" does not exist. Use list-tasks tool to see open tasks and then try again the select-task tool`

        const userConfirmedTask = await ctx.ui.confirm("Confirm Task", `selected task is "${selectedTask.name}"`)
        if(!userConfirmedTask) return `FAILED: user denied selecting this task. Wait for user input before proceeding.`

        // Collect task description from user
        const description = await ctx.ui.input("Task Description", "Add context or description for this task (optional):") ?? '';

        this.currentTask = selectedTask;

        // Start session with description
        await this.session.startSession(selectedTask.name, description);

        return await this.transition("plan", ctx);
    }
    //#endregion

    //#region start dev
    private registerTool_startDev() {
        this.pi.registerTool({
            name: "start-dev",
            label: "start development",
            description: "complete planning phase and start development (only available in PLAN mode)",
            parameters: Type.Object({
                requirements: Type.String({ description: "The requirements gathered during planning analysis" })
            }),

            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const result = await this.startDev(params.requirements, ctx);
                return {
                    content: [{ type: "text", text: result }],
                    details: {},
                };
            },
        });
    }

    private async startDev(requirements: string, ctx: ExtensionContext): Promise<string> {
        if(this.currentState != "plan") return `FAILED: you are only allowed to start development in PLAN state, but you are currently in ${this.currentState} state`

        if(!this.currentTask) return `FAILED: no task selected. Use select-task tool first.`

        const result = await (this.states["plan"] as PlanState).complete(requirements, ctx);

        if(!result.success)
            return `FAILED: ${result.requirements}. Planning phase was rejected. Continue analyzing the task.`

        return await this.transition("dev", ctx);
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
        if(this.currentState != "dev") return `FAILED: the review-task tool is only allowed in DEV state but you are currently in ${this.currentState} state`;

        const feedback = await this.transition("review", ctx);
        const success = feedback.startsWith("SUCCESS");

        if(!success) return feedback;

        this.taskStorage.completeTask(this.currentTask!.name);

        return await this.transition("idle", ctx);
    }
    //#endregion


    //#region helper
    private async transition(name: StateName, ctx: ExtensionContext) {
        if(this.currentState) {
            await this.states[this.currentState].onExit(ctx)
        }

        this.currentState = name;

        const promt = await this.states[this.currentState].onEnter(this.currentTask!, ctx); // todo: how to handle task does not exist
        return promt;
    }

    private sendMessage(msg: string) {
        // sends user message to agent
        this.pi.sendUserMessage(msg, {deliverAs: "steer"});
    }
    //#endregion

    //#region properties
    private pi: ExtensionAPI
    private taskStorage: TaskStorage;
    private session: Session;

    private states: Record<StateName, State>
    private currentState: StateName | undefined;
    private currentTask: Task | undefined = undefined;
    //#endregion
}

