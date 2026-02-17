import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Review } from "./mode/review";
import { Plan } from "./mode/plan";
import { Dev } from "./mode/dev";
import { resolve } from "node:path";
import { Task, TaskStorage } from "./util/task-storage";
import { Session } from "./util/session";
import { Idle } from "./mode/idle";

export enum FlowMode {
  IDLE,
  PLAN,
  DEV,
  REVIEW
}

// development flow (IDLE, PLAN, DEV, REVIEW)
export class Flow {
    constructor(pi: ExtensionAPI) {
        this.pi = pi;
        this.taskStorage = new TaskStorage(resolve(process.cwd(), 'tasks.md'));
        this.session = new Session(resolve(process.cwd(), 'session.json'));

        this.idle = new Idle();
        this.plan = new Plan(pi, this.session);
        this.dev = new Dev(pi, this.session);
        this.review = new Review(pi, this.session);
    }

    register() {
        this.registerCommand_initialize();
        this.registerCommand_listTasks();
        this.registerCommand_addTask();
        this.registerCommand_resumeFlow();
        this.registerTool_listTasks();
        this.registerTool_selectTask();
        this.registerTool_startDev();
        this.registerTool_reviewTask();

        this.dev.register();

        this.pi.on("agent_end", async (event, ctx) => {
            await this.verifyAgentIsDone();
        })
    }

    private async verifyAgentIsDone() {
        const tasksAreEmpty = (await this.taskStorage.getTasks()).length == 0;

        if(this.currentMode == FlowMode.IDLE && tasksAreEmpty) return;

        let message = `You are not done yet. Your current mode is: ${FlowMode[this.currentMode]}. `;

        if(this.currentMode == FlowMode.IDLE)
            message += `In IDLE mode you have to select the next open task using list-tasks tool and select-task tool`;
        if(this.currentMode == FlowMode.PLAN)
            message += `In PLAN mode you have to analyze the task requirements. When analysis is complete, use the start-dev tool with your gathered requirements to proceed to development.`;
        else if(this.currentMode == FlowMode.DEV)
            message += `In DEV mode you have to implement your task. When you are done, then call the review-task tool to review your code.`;

        this.sendMessage(message);
    }

    //#region command: initialize
    private registerCommand_initialize() {
        this.pi.registerCommand("initialize-flow", {
            description: "initialize agent flow",
            handler: async (_, ctx) => {
                ctx.ui.notify("dev flow enabled", "info");
                this.initialize(ctx);
            }
        })
    }

    private initialize(ctx: ExtensionContext) {
        this.switchMode(FlowMode.IDLE, ctx);
        this.sendMessage(this.idle.start());
    }
    //#endregion

    //#region command: resume
    private registerCommand_resumeFlow() {
        this.pi.registerCommand("resume-flow", {
            description: "resume the current flow from session.json",
            handler: async (_, ctx) => {
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

                // Resume based on status
                switch (sessionData.status) {
                    case 'planning':
                        ctx.ui.notify(`Resume planning session for task: ${this.currentTask.name}`, "info");
                        this.switchMode(FlowMode.PLAN, ctx);
                        this.sendMessage(await this.plan.start(this.currentTask, ctx));
                        break;
                    case 'developing':
                        ctx.ui.notify(`Resume development session for task: ${this.currentTask.name}`, "info");
                        this.switchMode(FlowMode.DEV, ctx);
                        this.sendMessage(await this.dev.start(this.currentTask, sessionData.requirements, ctx));
                        break;
                    case 'reviewing':
                        ctx.ui.notify(`Resume review session for task: ${this.currentTask.name}`, "info");
                        this.switchMode(FlowMode.REVIEW, ctx);
                        this.sendMessage((await this.review.start(ctx)).feedback);
                        break;
                    default:
                        ctx.ui.notify(`Unknown session status: ${sessionData.status}`, "error");
                }
            }
        });
    }
    //#endregion


    //#region command: list-tasks
    private registerCommand_listTasks() {
        this.pi.registerCommand("list-tasks", {
            description: "list all open and closed tasks from tasks.md",
            handler: async (_, ctx) => {
                const tasks = await this.taskStorage.getTasks();
                
                if (tasks.length === 0) {
                    ctx.ui.notify("No open tasks found", "info");
                } else {
                    const taskList = tasks.map(t => `• [${t.isDone ? "x" : " "}] ${t.name}`).join('\n');
                    ctx.ui.notify(`tasks:\n${taskList}`, "info");
                }
            }
        });
    }
    //#endregion

    //#region command: add-task
    private registerCommand_addTask() {
        this.pi.registerCommand("add-task", {
            description: "add a new task to tasks.md",
            handler: async (_, ctx) => {
                const name = await ctx.ui.input("Task name");
                if (!name) {
                    ctx.ui.notify("Task name is required", "error");
                    return;
                }
                
                const description = await ctx.ui.input("Task description (optional)");
                
                await this.taskStorage.addTask(name, description || '');
                ctx.ui.notify(`Task "${name}" added successfully`, "info");
            }
        });
    }
    //#endregion

    //#region list-tasks
    private registerTool_listTasks() {
        this.pi.registerTool({
            name: "list-tasks",
            label: "list tasks",
            description: "list all open tasks",
            parameters: Type.Object({}),

            execute: async (_toolCallId, _params, _onUpdate, _ctx) => {
                const result = await this.listTasks();
                return {
                    content: [{ type: "text", text: result }],
                    details: {},
                };
            },
        });
    }

    private async listTasks(): Promise<string> {
        const openTasks = (await this.taskStorage.getTasks()).filter(t => !t.isDone);
        
        if (openTasks.length === 0) {
            return `SUCCESS: no open tasks found. Create a tasks.md file in the project root with tasks in format: "- [ ] Task name - Description"`;
        }
        
        const taskNames = openTasks.map(t => t.name).join(",");
        return `your current open tasks are: ${taskNames}`;
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

        const tasks = await this.taskStorage.getTasks();
        const selectedTask = tasks.find(t => t.name == name);
        if(selectedTask == undefined) return `FAILED: your selected task does not exist. Use list-tasks tool to see open tasks and then try again the select-task tool`

        const userConfirmedTask = await ctx.ui.confirm("Confirm Task", `selected task is ${selectedTask.name}`)
        if(!userConfirmedTask) return `FAILED: user denied selecting this task. Wait for user input before proceeding.`

        this.currentTask = selectedTask;

        this.switchMode(FlowMode.PLAN, ctx);
        return await this.plan.start(selectedTask, ctx);
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
        if(this.currentMode != FlowMode.PLAN) return `FAILED: you are only allowed to start development in PLAN mode, but you are currently in ${FlowMode[this.currentMode]}`

        if(!this.currentTask) return `FAILED: no task selected. Use select-task tool first.`

        const result = await this.plan.complete(requirements, ctx);

        if(!result.success)
            return `FAILED: ${result.requirements}. Planning phase was rejected. Continue analyzing the task.`

        this.switchMode(FlowMode.DEV, ctx);
        return await this.dev.start(this.currentTask, requirements, ctx);
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
        if(this.currentMode != FlowMode.DEV) return `FAILED: the review-task tool is only allowed in DEV mode but you are currently in ${FlowMode[this.currentMode]} mode`;

        this.switchMode(FlowMode.REVIEW, ctx);

        const result = await this.review.start(ctx);

        if(!result.success)
            return `FAILED: ${result.feedback}. Your review got rejected. You are back still in DEV. Fix all review suggestions and then run review-task tool again. Do it autonomously without asking for user permission.`

        this.taskStorage.completeTask(this.currentTask!.name);
        this.switchMode(FlowMode.IDLE, ctx);
        return `SUCCESS: ${result.feedback}. You are done with this task. ${this.idle.start()}`
    }
    //#endregion


    
    //#region helper
    private sendMessage(msg: string) {
        // sends user message to agent
        this.pi.sendUserMessage(msg, {deliverAs: "steer"});
    }

    private switchMode(mode: FlowMode, ctx: ExtensionContext) {
        this.currentMode = mode;
        ctx.ui.notify(`mode switched to ${FlowMode[mode]}`)
    }
    //#endregion

    //#region properties
    private pi: ExtensionAPI
    private taskStorage: TaskStorage;
    private session: Session;
    
    private idle: Idle;
    private plan: Plan;
    private dev: Dev;
    private review: Review;

    private currentMode = FlowMode.IDLE;
    private currentTask: Task | undefined = undefined;
    //#endregion
}

