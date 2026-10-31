import { reactive } from 'vue';

export const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  detail: '',
  confirmText: '确定',
  cancelText: '取消',
  tone: 'default',
});

let resolver = null;

export function requestConfirm(options = {}) {
  if (resolver) {
    resolver(false);
    resolver = null;
  }

  confirmState.title = options.title || '请确认';
  confirmState.message = options.message || '';
  confirmState.detail = options.detail || '';
  confirmState.confirmText = options.confirmText || '确定';
  confirmState.cancelText = options.cancelText || '取消';
  confirmState.tone = options.tone || 'default';
  confirmState.open = true;

  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function resolveConfirm(value) {
  confirmState.open = false;
  const finish = resolver;
  resolver = null;
  finish?.(Boolean(value));
}
