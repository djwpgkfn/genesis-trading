// Presentation view codec: pure JSON serialize/deserialize for presentation DTOs.
// deserialize(serialize(v)) deep-equals v for any plain presentation view.
export function serializeView<T>(view: T): string {
  return JSON.stringify(view);
}
export function deserializeView<T>(json: string): T {
  return JSON.parse(json) as T;
}
