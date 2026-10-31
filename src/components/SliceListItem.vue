<script setup>
import { computed } from 'vue';
import { NotebookPen } from 'lucide-vue-next';
import { SLICE_TAGS } from '../lib/slices.js';
import { formatTime } from '../lib/time.js';

const props = defineProps({
  slice: { type: Object, required: true },
  index: { type: Number, required: true },
  active: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
});
defineEmits(['select']);

const tag = computed(() => SLICE_TAGS[props.slice.tag] ?? SLICE_TAGS.review);
const preview = computed(() => props.slice.preview || '本段暂无匹配字幕，可直接听讲并记录笔记。');
const number = computed(() => String(props.index + 1).padStart(2, '0'));
const hasNote = computed(() => Boolean(String(props.slice.note || '').trim()));

const tagClasses = {
  done: 'bg-moss-soft text-moss border-moss/15',
  review: 'bg-amber-soft text-amber border-amber/15',
  hard: 'bg-clay-soft text-clay border-clay/15',
};
</script>

<template>
  <button
    type="button"
    class="transition-panel group relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left"
    :class="
      active
        ? 'border-pine/25 bg-surface-strong shadow-card'
        : 'border-transparent bg-transparent hover:border-line/70 hover:bg-surface/70'
    "
    :aria-current="active ? 'true' : undefined"
    @click="$emit('select', slice.id)"
  >
    <span
      class="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full transition"
      :class="active ? 'bg-pine' : 'bg-transparent group-hover:bg-line-strong'"
    ></span>

    <div class="flex items-center gap-2">
      <span
        class="font-mono text-[9.5px] font-medium tabular-nums tracking-[0.08em]"
        :class="active ? 'text-pine' : 'text-faint'"
      >
        {{ number }}
      </span>
      <span
        class="rounded border px-1.5 py-[1px] text-[9px] font-medium leading-4"
        :class="tagClasses[slice.tag] || tagClasses.review"
      >
        {{ tag.label }}
      </span>
      <span class="ml-auto font-mono text-[10px] tabular-nums text-faint">
        {{ formatTime(slice.startTime) }}
      </span>
    </div>

    <p
      class="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-[1.55]"
      :class="active ? 'text-ink' : 'text-ink-soft'"
    >
      {{ slice.title }}
    </p>
    <p class="mt-1 line-clamp-2 text-[10.5px] leading-[1.55] text-faint">
      {{ preview }}
    </p>

    <div class="mt-2 flex items-center gap-2">
      <span
        v-if="hasNote"
        class="inline-flex items-center gap-1 rounded bg-pine-soft/70 px-1.5 py-0.5 text-[9px] font-medium text-pine"
      >
        <NotebookPen :size="9" :stroke-width="2" />
        有笔记
      </span>
      <span class="text-[9.5px] tabular-nums text-faint">
        {{ Math.round(slice.endTime - slice.startTime) }}s
      </span>
      <span v-if="active && playing" class="equalizer ml-auto flex h-3 items-center gap-[2px] text-pine">
        <span></span><span></span><span></span>
      </span>
      <span v-else-if="active" class="ml-auto text-[9px] font-medium uppercase tracking-[0.14em] text-pine/70">
        Now
      </span>
    </div>

    <div v-if="active" class="mt-2.5 h-[2px] overflow-hidden rounded-full bg-line/60">
      <div
        class="h-full rounded-full bg-pine/70 transition-[width] duration-300"
        :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }"
      ></div>
    </div>
  </button>
</template>
