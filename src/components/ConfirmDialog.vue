<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AlertTriangle, X } from 'lucide-vue-next';
import { confirmState, resolveConfirm } from '../composables/useConfirm.js';

const confirmButton = ref(null);

function cancel() {
  resolveConfirm(false);
}

function accept() {
  resolveConfirm(true);
}

function onKeydown(event) {
  if (!confirmState.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    accept();
  }
}

watch(
  () => confirmState.open,
  async (open) => {
    if (open) {
      await nextTick();
      confirmButton.value?.focus();
    }
  },
);

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="confirmState.open"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[2px]"
        @mousedown.self="cancel"
      >
        <div
          class="animate-dialog-in w-full max-w-[430px] overflow-hidden rounded-2xl border border-line bg-surface-strong shadow-lift"
          role="dialog"
          aria-modal="true"
          :aria-label="confirmState.title"
        >
          <div class="flex items-start gap-3.5 px-5 pb-4 pt-5">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              :class="confirmState.tone === 'danger' ? 'bg-clay-soft text-clay' : 'bg-pine-soft text-pine'"
            >
              <AlertTriangle :size="19" :stroke-width="1.8" />
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="text-[15px] font-semibold tracking-tight text-ink">{{ confirmState.title }}</h2>
              <p v-if="confirmState.message" class="mt-1 text-[13px] leading-6 text-ink-soft">
                {{ confirmState.message }}
              </p>
              <p v-if="confirmState.detail" class="mt-2 rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-muted">
                {{ confirmState.detail }}
              </p>
            </div>
            <button
              class="focus-ring -mr-1 -mt-1 rounded-lg p-1.5 text-faint transition hover:bg-paper hover:text-ink"
              aria-label="关闭"
              @click="cancel"
            >
              <X :size="16" />
            </button>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-line/70 bg-paper/55 px-5 py-3.5">
            <button
              class="focus-ring rounded-lg px-3.5 py-2 text-[13px] font-medium text-muted transition hover:bg-paper-deep hover:text-ink"
              @click="cancel"
            >
              {{ confirmState.cancelText }}
            </button>
            <button
              ref="confirmButton"
              class="focus-ring rounded-lg px-4 py-2 text-[13px] font-semibold text-surface-strong shadow-sm transition active:scale-[0.98]"
              :class="confirmState.tone === 'danger' ? 'bg-clay hover:bg-[#9d452d]' : 'bg-pine hover:bg-pine-2'"
              @click="accept"
            >
              {{ confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 180ms ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
