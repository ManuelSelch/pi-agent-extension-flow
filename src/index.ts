export class ToDo {
  private items: string[] = [];

  list(): string[] {
    return this.items;
  }

  add(item: string) {
    this.items.push(item);
  }

  delete(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
    }
  }
}
