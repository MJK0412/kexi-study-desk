<script setup>
import { AlertTriangle, Check, RotateCcw } from 'lucide-vue-next';
import { SLICE_TAGS } from '../lib/slices.js';

const props = defineProps({
  modelValue: { type: String, default: 'review' },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const options = [
  { value: 'done', icon: Check, label: SLICE_TAGS.done.label },
  { value: 'review', icon: RotateCcw, label: SLICE_TAGS.review.label },
  { value: 'hard', icon: AlertTriangle, label: SLICE_TAGS.hard.label },
];

const activeClasses = {
  done: 'border-moss/35 bg-moss-soft text-moss shadow-sm',
  review: 'border-amber/30 bg-amber-soft text-amber shadow-sm',
  hard: 'border-clay/30 bg-clay-soft text-clay shadow-sm',
};
</script>

<template>
  <div class="flex items-center gap-1 rounded-lg bg-paper/65 p-1">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="focus-ring inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-transparent font-medium transition"
      :class="[
        compact ? 'px-1.5 py-1 text-[10px]' : 'px-2 py-1.5 text-[10.5px]',
        modelValue === option.value
          ? activeClasses[option.value]
          : 'text-muted hover:bg-surface/70 hover:text-ink',
      ]"
      :aria-pressed="modelValue === option.value"
      @click="emit('update:modelValue', option.value)"
    >
      <component :is="option.icon" :size="compact ? 10 : 11" :stroke-width="2.2" />
      {{ option.label }}
    </button>
  </div>
</template>
