<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Clock3, ListMusic, Volume2 } from 'lucide-vue-next';
import {
  activeCue,
  currentCues,
  currentSlice,
  currentSliceIndex,
  seekTo,
  state,
} from '../stores/studio.js';
import { formatTime } from '../lib/time.js';

const listRef = ref(null);

const rangeLabel = computed(() => {
  if (!currentSlice.value) return '';
  return `${formatTime(currentSlice.value.startTime)} – ${formatTime(currentSlice.value.endTime)}`;
});

watch(
  () => activeCue.value?.id,
  async () => {
    if (!state.isPlaying) return;
    await nextTick();
    const element = listRef.value?.querySelector('[data-active-cue="true"]');
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
);

function jumpToCue(cue) {
  seekTo(cue.start, { play: state.isPlaying });
}
</script>

<template>
  <section class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface/85 shadow-card">
    <div class="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-4 py-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <p class="text-[9px] font-semibold uppercase tracking-[0.2em] text-faint">Transcript</p>
          <span class="rounded bg-paper px-1.5 py-0.5 font-mono text-[8.5px] tabular-nums text-muted">
            {{ String(currentSliceIndex + 1).padStart(2, '0') }}
          </span>
        </div>
        <h2 class="mt-1 truncate text-[13px] font-semibold text-ink">
          {{ currentSlice?.title || '当前切片' }}
        </h2>
      </div>
      <div class="shrink-0 text-right">
        <p class="font-mono text-[9.5px] tabular-nums text-muted">{{ rangeLabel }}</p>
        <p class="mt-1 inline-flex items-center gap-1 text-[9px] text-faint">
          <ListMusic :size="10" />
          {{ currentCues.length }} 条字幕
        </p>
      </div>
    </div>

    <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
      <div v-if="currentCues.length" class="space-y-0.5">
        <button
          v-for="cue in currentCues"
          :key="cue.id"
          type="button"
          class="group flex w-full items-start gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition"
          :class="
            activeCue?.id === cue.id
              ? 'border-pine/10 bg-pine-soft/65'
              : 'hover:bg-paper/75'
          "
          :data-active-cue="activeCue?.id === cue.id ? 'true' : 'false'"
          @click="jumpToCue(cue)"
        >
          <span
            class="mt-[2px] inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 font-mono text-[9px] tabular-nums transition"
            :class="
              activeCue?.id === cue.id
                ? 'bg-pine text-surface-strong'
                : 'bg-paper text-faint group-hover:text-pine'
            "
          >
            <Volume2 v-if="activeCue?.id === cue.id" :size="8" />
            {{ formatTime(cue.start) }}
          </span>
          <span
            class="text-[11.5px] leading-[1.75]"
            :class="activeCue?.id === cue.id ? 'font-medium text-ink' : 'text-ink-soft'"
          >
            {{ cue.text }}
          </span>
        </button>
      </div>

      <div v-else class="flex h-full min-h-[150px] flex-col items-center justify-center px-6 text-center">
        <Clock3 :size="22" :stroke-width="1.4" class="text-faint/70" />
        <p class="mt-2.5 text-[11.5px] font-medium text-ink-soft">本段还没有字幕</p>
        <p class="mt-1 max-w-[230px] text-[10px] leading-5 text-faint">
          可以继续听讲并记录笔记，或导入更完整的字幕文件。
        </p>
      </div>
    </div>

    <div class="flex shrink-0 items-center justify-between border-t border-line/60 bg-paper/30 px-4 py-1.5 text-[9px] text-faint">
      <span>点击字幕可跳转到对应时间</span>
      <span class="font-mono tabular-nums">{{ formatTime(state.currentTime) }}</span>
    </div>
  </section>
</template>
