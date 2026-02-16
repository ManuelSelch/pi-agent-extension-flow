export class ToDo {
  private _todos: string[] = [];

  list(): string[] {
    // Return a copy to prevent external mutation
    return [...this._todos];
  }

  add(task: string): void {
    this._todos.push(task);
  }
}