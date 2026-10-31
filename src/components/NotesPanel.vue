<script setup>
import { computed, nextTick, ref } from 'vue';
import {
  Check,
  Loader2,
  NotebookPen,
  PauseCircle,
  Quote,
  Sparkles,
  TriangleAlert,
} from 'lucide-vue-next';
import TagPicker from './TagPicker.vue';
import {
  activeCue,
  appendCueToNote,
  currentCues,
  currentSlice,
  pauseForNote,
  setPauseOnNoteFocus,
  setTag,
  state,
  updateNote,
} from '../stores/studio.js';

const noteRef = ref(null);

const note = computed({
  get: () => currentSlice.value?.note ?? '',
  set: (value) => updateNote(value),
});

const tag = computed({
  get: () => currentSlice.value?.tag ?? 'review',
  set: (value) => setTag(value),
});

const quoteCue = computed(() => activeCue.value || currentCues.value[0] || null);
const noteLength = computed(() => note.value.length);

const saveLabel = computed(() => {
  if (state.saveState === 'saving') return '保存中';
  if (state.saveState === 'error') return '保存失败';
  if (state.saveState === 'saved') return '已保存';
  return '自动保存';
});

function focusNote() {
  pauseForNote();
}

async function quoteCurrentCue() {
  appendCueToNote(quoteCue.value);
  await nextTick();
  const element = noteRef.value;
  if (element) {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface/85 shadow-card">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="flex h-6 w-6 items-center justify-center rounded-md bg-pine-soft text-pine">
          <NotebookPen :size="13" :stroke-width="1.9" />
        </span>
        <div>
          <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">Study notes</p>
          <p class="text-[11.5px] font-semibold text-ink">本段笔记</p>
        </div>
      </div>
      <span
        class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium"
        :class="
          state.saveState === 'error'
            ? 'bg-clay-soft text-clay'
            : state.saveState === 'saving'
              ? 'bg-paper text-muted'
              : 'bg-moss-soft/70 text-moss'
        "
      >
        <Loader2 v-if="state.saveState === 'saving'" :size="9" class="animate-spin" />
        <TriangleAlert v-else-if="state.saveState === 'error'" :size="9" />
        <Check v-else :size="9" :stroke-width="2.5" />
        {{ saveLabel }}
      </span>
    </div>

    <div class="shrink-0 px-3 pt-2.5">
      <TagPicker v-model="tag" compact />
    </div>

    <div class="relative min-h-0 flex-1 px-3 pb-1 pt-2">
      <textarea
        ref="noteRef"
        v-model="note"
        class="focus-ring h-full min-h-[92px] w-full rounded-lg border border-transparent bg-paper/45 px-3 py-2.5 text-[11.5px] leading-[1.75] text-ink-soft transition placeholder:text-faint/80 hover:bg-paper/65 focus:border-line focus:bg-surface-strong"
        placeholder="记下重点、老师的例子，或还没想通的地方……&#10;笔记会自动保存，并只属于当前切片。"
        spellcheck="false"
        @focus="focusNote"
      ></textarea>
      <div class="pointer-events-none absolute bottom-2.5 right-5 flex items-center gap-1 text-[8.5px] text-faint/70">
        <Sparkles :size="8" />
        {{ noteLength }} 字
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1.5 px-3 py-1.5">
      <button
        type="button"
        class="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] font-medium text-muted transition hover:bg-paper hover:text-pine disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!quoteCue"
        title="把当前字幕摘录到笔记末尾"
        @click="quoteCurrentCue"
      >
        <Quote :size="10" />
        引用当前字幕
      </button>
      <span class="ml-auto inline-flex items-center gap-1.5 text-[9px] text-faint">
        <PauseCircle :size="10" />
        记笔记时暂停
        <button
          type="button"
          class="focus-ring relative h-3.5 w-6 rounded-full transition"
          :class="state.pauseOnNoteFocus ? 'bg-pine' : 'bg-line-strong'"
          role="switch"
          :aria-checked="state.pauseOnNoteFocus"
          title="聚焦笔记输入框时自动暂停视频"
          @click="setPauseOnNoteFocus(!state.pauseOnNoteFocus)"
        >
          <span
            class="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-surface-strong shadow-sm transition-all"
            :class="state.pauseOnNoteFocus ? 'left-3' : 'left-0.5'"
          ></span>
        </button>
      </span>
    </div>
  </section>
</template>
