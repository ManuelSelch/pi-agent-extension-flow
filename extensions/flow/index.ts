import { ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox";
import { resolve } from "node:path";
import { Flow } from "./flow"
import { TaskStorage } from "./util/task-storage"

export default function (pi: ExtensionAPI) {
    let flow = new Flow(pi);
    let taskStorage = new TaskStorage(resolve(process.cwd(), 'tasks.md'));

    flow.register();

    //#region tool_call: disable ls -R
    pi.on("tool_call", (event, ctx) => {
        if(isToolCallEventType("bash", event)) {
            if(event.input.command.includes("ls -R"))
                return { block: true, reason: "you are not allowed to use recursive bash comand ls -R, use ls instead without -R" }
        }
    })
    //#endregion

    //#region command: list-tasks
    pi.registerCommand("list-tasks", {
        description: "list all open and closed tasks from tasks.md",
        handler: async (_, ctx) => {
            const tasks = await taskStorage.getTasks();
            
            if (tasks.length === 0) {
                ctx.ui.notify("No open tasks found", "info");
            } else {
                const taskList = tasks.map(t => `• [${t.isDone ? "x" : " "}] ${t.name}`).join('\n');
                ctx.ui.notify(`tasks:\n${taskList}`, "info");
            }
        }
    });
    //#endregion

    //#region command: add-task
    pi.registerCommand("add-task", {
        description: "add a new task to tasks.md",
        handler: async (_, ctx) => {
            const name = await ctx.ui.input("Task name");
            if (!name) {
                ctx.ui.notify("Task name is required", "error");
                return;
            }
            
            await taskStorage.addTask(name);
            ctx.ui.notify(`Task "${name}" added successfully`, "info");
        }
    });
    //#endregion

    //#region tool: list tasks
    pi.registerTool({
        name: "list-tasks",
        label: "list tasks",
        description: "list all open tasks",
        parameters: Type.Object({}),

        execute: async (_toolCallId, _params, _onUpdate, _ctx) => {
            const result = await listTasks();
            return {
                content: [{ type: "text", text: result }],
                details: {},
            };
        },
    });

    async function listTasks(): Promise<string> {
        const openTasks = (await taskStorage.getTasks()).filter(t => !t.isDone);
        
        if (openTasks.length === 0) {
            return `SUCCESS: no open tasks found. Create a tasks.md file in the project root with tasks in format: "- [ ] Task name - Description"`;
        }
        
        const taskNames = openTasks.map(t => t.name).join(",");
        return `your current open tasks are: ${taskNames}`;
    }
    //#endregion

}