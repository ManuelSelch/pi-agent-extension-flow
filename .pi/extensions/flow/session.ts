import { readFile, writeFile, access } from "node:fs/promises";

export type SessionData = {
    taskName: string;
    taskDescription: string;
    requirements: string;
    startedAt: string;
    status: 'planning' | 'developing' | 'reviewing' | 'completed';
};

/**
 * Session manages the current development session state.
 * Stores session data in session.md at the project root.
 */
export class Session {
    constructor(private sessionFilePath: string) {}

    /**
     * Start a new session for a task.
     * Creates the session.md file with initial state.
     */
    async startSession(taskName: string, taskDescription: string): Promise<void> {
        const sessionData: SessionData = {
            taskName,
            taskDescription,
            requirements: '',
            startedAt: new Date().toISOString(),
            status: 'planning'
        };

        await this.writeSession(sessionData);
    }

    /**
     * Save requirements to the session after planning is complete.
     */
    async saveRequirements(requirements: string): Promise<void> {
        const session = await this.readSession();
        if (!session) {
            throw new Error('No active session found. Start a session first.');
        }

        session.requirements = requirements;
        session.status = 'developing';
        await this.writeSession(session);
    }

    /**
     * Update session status.
     */
    async updateStatus(status: SessionData['status']): Promise<void> {
        const session = await this.readSession();
        if (!session) {
            throw new Error('No active session found. Start a session first.');
        }

        session.status = status;
        await this.writeSession(session);
    }

    /**
     * Complete and clear the session.
     */
    async completeSession(): Promise<void> {
        try {
            await writeFile(this.sessionFilePath, '', 'utf-8');
        } catch {
            // Ignore errors if file doesn't exist
        }
    }

    /**
     * Read the current session data.
     */
    async readSession(): Promise<SessionData | null> {
        try {
            await access(this.sessionFilePath);
            const content = await readFile(this.sessionFilePath, 'utf-8');
            if (!content.trim()) return null;
            return JSON.parse(content) as SessionData;
        } catch {
            return null;
        }
    }

    /**
     * Check if there's an active session.
     */
    async hasActiveSession(): Promise<boolean> {
        const session = await this.readSession();
        return session !== null && session.status !== 'completed';
    }

    private async writeSession(sessionData: SessionData): Promise<void> {
        await writeFile(this.sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf-8');
    }
}
