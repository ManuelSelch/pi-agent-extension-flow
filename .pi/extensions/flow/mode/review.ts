import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Session } from "../util/session";

export type ReviewFeedback = {
    success: boolean,
    feedback: string
}

// review code provided by agent by
// - running lint
// - running tests
// - running review agent
// - aproving my human
export class Review {
    constructor(pi: ExtensionAPI, session: Session) {
        this.pi = pi;
        this.session = session;
    }

    //#region review task
    async start(ctx: ExtensionContext): Promise<ReviewFeedback> {
        // const linter = await this.runLinter(ctx);
        // if(!linter.success) return linter;

        // const tests = await this.runTests(ctx);
        // if(!tests.success) return tests;

        await this.session.updateStatus("reviewing");

        const human = await this.reviewByHuman(ctx);
        
        if(human.success)
            this.session.completeSession();

        return human;
    }

    private async runLinter(ctx: ExtensionContext): Promise<ReviewFeedback> {
        ctx.ui.notify("run linter ...", "info");

        return { success: false, feedback: "linter failed, because your code contains syntax errors" }
    }

    private async runTests(ctx: ExtensionContext): Promise<ReviewFeedback> {
        ctx.ui.notify("run tests ...", "info");

        return { success: false, feedback: "tests failed, because implementation dont fit tests" }
    }

    private async reviewByHuman(ctx: ExtensionContext): Promise<ReviewFeedback> {
        const userConfirmed = await ctx.ui.confirm("Review Task", "did agent implement task successfully?");

        if(!userConfirmed) return { success: false, feedback: `user reviewed your code implementation and denied it. Wait for input form user before proceeding.` }

        return { success: true, feedback: `user reviewed your code implementation and approved it. Full review pipeline passed.`}
    }
    //#endregion

    private pi: ExtensionAPI;
    private session: Session;
}