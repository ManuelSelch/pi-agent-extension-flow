import { ToDo } from "../src/index";

let todo: ToDo

beforeEach(() => {
  todo = new ToDo();
})


describe('Demo', () => {
  it('should return an empty list', () => {
    expect(todo.list()).toStrictEqual([]);
  });

  it('can add and list todo items', () => {
    todo.add('task1');
    todo.add('task2');
    expect(todo.list()).toStrictEqual(['task1','task2']);
  });
});