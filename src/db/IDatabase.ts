export default interface IDatabase<T> {
  init: () => Promise<void>;

  find: (querySpec: string) => Promise<Array<T>>;

  addItem: (item: T) => Promise<T>;

  getItem: (itemId: string) => Promise<T | undefined>;

  listAll: () => Promise<Array<T>>;

  deleteItem: (itemId: string) => Promise<T | undefined>;

  getLastItem: () => Promise<T | undefined>;
}
