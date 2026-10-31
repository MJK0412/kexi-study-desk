<script setup>
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-vue-next';
import { toastState, dismissToast } from '../composables/useToast.js';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex flex-col items-center gap-2 px-4">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastState.items"
          :key="toast.id"
          class="animate-toast-in pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-line/80 bg-surface-strong px-4 py-3 shadow-lift"
          :class="{
            'border-moss/25': toast.type === 'success',
            'border-clay/25': toast.type === 'error',
            'border-line': toast.type === 'info',
          }"
          role="status"
        >
          <component
            :is="icons[toast.type] || Info"
            :size="18"
            :stroke-width="1.9"
            class="mt-0.5 shrink-0"
            :class="{
              'text-moss': toast.type === 'success',
              'text-clay': toast.type === 'error',
              'text-muted': toast.type === 'info',
            }"
          />
          <p class="flex-1 text-[13px] leading-5 text-ink-soft">{{ toast.message }}</p>
          <button
            class="focus-ring -mr-1 mt-0.5 rounded p-0.5 text-faint transition hover:text-ink"
            aria-label="关闭提示"
            @click="dismissToast(toast.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-leave-active {
  transition: all 180ms ease;
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.toast-move {
  transition: transform 220ms ease;
}
</style>
