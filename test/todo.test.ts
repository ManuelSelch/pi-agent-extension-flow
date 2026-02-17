import { ToDo } from "../src/index";

let todo: ToDo

beforeEach(() => {
  todo = new ToDo();
})


describe('list', () => {
  it('should return an empty list', () => {
    expect(todo.list()).toStrictEqual([]);
  });

  it('can add and list todo items', () => {
    todo.add('task1');
    todo.add('task2');
    expect(todo.list()).toStrictEqual(['task1','task2']);
  });
});

describe('delete', () => {
  it('can delete a todo item by index', () => {
    todo.add('task1');
    todo.add('task2');
    todo.add('task3');
    todo.delete(1);
    expect(todo.list()).toStrictEqual(['task1', 'task3']);
  });

  it('handles deleting at index 0', () => {
    todo.add('task1');
    todo.add('task2');
    todo.delete(0);
    expect(todo.list()).toStrictEqual(['task2']);
  });

  it('handles out of bounds index gracefully', () => {
    todo.add('task1');
    todo.delete(5);
    expect(todo.list()).toStrictEqual(['task1']);
  });
});