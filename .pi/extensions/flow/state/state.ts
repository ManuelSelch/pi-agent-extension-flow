import { ExtensionContext, ToolCallEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { Task } from "../util/task-storage";

/**
 * Base interface for all flow states.
 * Each state encapsulates its own behavior, tool restrictions, and transitions.
 */
export interface State {
    /**
     * Called when entering this state.
     * Initialize UI, enable tool blocking, update session.
     */
    onEnter(task: Task, ctx: ExtensionContext): Promise<string>;
    
    /**
     * Called when exiting this state.
     * Clean up UI, disable tool blocking, persist state.
     */
    onExit(ctx: ExtensionContext): Promise<void>;
    
    /**
     * Handle tool calls in this state.
     * Return a block result to prevent the tool from executing.
     */
    onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<{ block: boolean; reason?: string } | void>;
    
    /**
     * Handle tool results in this state.
     * Called after a tool executes successfully.
     */
    onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void>;
    
    /**
     * Get the prompt text for the agent in this state.
     */
    getPrompt(task: Task): string;
}

export type StateName = 'idle' | 'plan' | 'dev' | 'review';
