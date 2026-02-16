export class ToDo {
  private items: string[] = [];

  list(): string[] {
    return this.items;
  }

  add(item: string) {
    this.items.push(item);
  }

  delete(item: string) {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }
}
