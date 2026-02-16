import { ToDo } from "../src/index";

let todo = new ToDo();


describe('Demo', () => {
  it('should return an empty list', () => {
    expect(todo.list()).toStrictEqual(['not-empty']);
  });

  it('can add and list todo items', () => {
    todo.add('task1');
    todo.add('task2');
    expect(todo.list()).toStrictEqual(['task1','task2']);
  });
});