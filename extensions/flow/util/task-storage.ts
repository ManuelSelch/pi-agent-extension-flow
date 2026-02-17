import { readFile, writeFile, access } from "node:fs/promises";

export type Task = {
    name: string,
    isDone: boolean
}


/**
 * TaskStorage handles reading and writing tasks to a markdown file.
 * Tasks are stored in tasks.md at the project root with the format:
 * 
 * - [ ] Task name - Task description
 * - [ ] Another task - Another description
 * 
 * Completed tasks (marked with [x]) are filtered out.
 */
export class TaskStorage {
    constructor(private taskFilePath: string) {}

    /**
     * Read all open and closed tasks from the tasks.md file.
     * Returns empty array if file doesn't exist.
     */
    async getTasks(): Promise<Task[]> {
        try {
            // Check if file exists
            await access(this.taskFilePath);
            const content = await readFile(this.taskFilePath, 'utf-8');
            return this.parseTasks(content);
        } catch {
            // File doesn't exist or can't be read
            return [];
        }
    }

    /**
     * Parse markdown content to extract tasks.
     * Format: - [ ] name
     */
    private parseTasks(content: string): Task[] {
        return content.split("\n")
            .filter(l => l.startsWith("- [ ]") || l.startsWith("- [x]"))
            .map(l => {
                let isDone = l.startsWith("- [x]");
                let name = l.slice(5).trim()
                return { name, isDone }
            })
    }

    /**
     * complets a task from the tasks.md file by marking it as completed.
     * This preserves the task history while marking it as done.
     */
    async completeTask(taskName: string): Promise<void> {
        try {
            await access(this.taskFilePath);
            let content = await readFile(this.taskFilePath, 'utf-8');
            
            // Find and mark the task as completed
            const lines = content.split('\n');
            const updatedLines = lines.map(line => {
                // Match the task name (case-insensitive)
                const regex = new RegExp(`^([-\\*]\\s+)(\\[\\s*\\])(\\s+${this.escapeRegex(taskName)}(?:\\s+-\\s+.+)?)$`, 'i');
                if (regex.test(line.trim())) {
                    return line.replace(/\[\s*\]/, '[x]');
                }
                return line;
            });
            
            await writeFile(this.taskFilePath, updatedLines.join('\n'), 'utf-8');
        } catch {
            // File doesn't exist or can't be read - nothing to delete
        }
    }

    /**
     * Add a new task to the tasks.md file.
     * Creates the file if it doesn't exist.
     */
    async addTask(name: string): Promise<void> {
        const taskLine = `- [ ] ${name}`;
        
        try {
            // Check if file exists
            await access(this.taskFilePath);
            // Append to existing file
            const content = await readFile(this.taskFilePath, 'utf-8');
            const newContent = content.trim() + '\n' + taskLine + '\n';
            await writeFile(this.taskFilePath, newContent, 'utf-8');
        } catch {
            // File doesn't exist - create it
            await writeFile(this.taskFilePath, taskLine + '\n', 'utf-8');
        }
    }

    /**
     * Escape special regex characters in task name
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
