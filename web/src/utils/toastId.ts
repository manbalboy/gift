let toastSequence = 0;

export function createToastId() {
  toastSequence += 1;
  return `toast-${toastSequence}`;
}
