export function withoutOwner<T extends { ownerToken: string }>(value: T) {
  const { ownerToken: _ownerToken, ...result } = value;
  return result;
}
