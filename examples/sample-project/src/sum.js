export function sum(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) throw new TypeError('sum accepts finite numbers');
  return left + right;
}
