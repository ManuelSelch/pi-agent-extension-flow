export class ToDo {
  private items: string[] = [];

  list(): string[] {
    return this.items;
  }

  add(item: string) {
    this.items.push(item);
  }
}